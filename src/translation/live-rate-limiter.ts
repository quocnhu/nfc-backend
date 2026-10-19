import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Logger } from '@nestjs/common';

/**
 * LiveRateLimiter — abuse controls for the public realtime translator.
 *
 * The `/translation-live` socket is deliberately unauthenticated so a stranger
 * can scan the QR and translate straight away. That makes it the most exposed
 * surface in the app, and each accepted message costs real CPU on the
 * self-hosted LibreTranslate container. Without a ceiling, one client could
 * saturate translation for everyone.
 *
 * Nest's ThrottlerGuard only covers the HTTP pipeline, so socket messages need
 * their own accounting. Three independent budgets, because each stops a
 * different abuse shape:
 *
 *   per-minute    a burst or a runaway client
 *   per-hour      sustained scraping
 *   per-day       a slow drip that stays under every short window
 *
 * Plus a cap on concurrent sockets per IP, which bounds a single visitor's
 * footprint regardless of how fast they send.
 *
 * State is in-memory by design: this is a per-process guard for one instance,
 * and it must not become a shared datastore. Behind multiple instances the
 * limits would multiply rather than merge — noted in the README as the thing
 * to move to Redis if the backend is ever scaled horizontally.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface Limits {
  /** Turns per minute from one IP. */
  perMinute: number;
  /** Turns per hour from one IP. */
  perHour: number;
  /** Turns per day from one IP. */
  perDay: number;
  /** Simultaneous sockets from one IP. */
  concurrentSockets: number;
  /** Longest accepted utterance. */
  maxTextLength: number;
  /** Most output languages accepted per turn. */
  maxTargets: number;
}

export const DEFAULT_LIVE_LIMITS: Limits = {
  // A fast conversation is ~3 turns a minute; 40 leaves generous headroom for
  // a bursty speaker without letting one client monopolise the CPU.
  perMinute: 40,
  perHour: 600,
  perDay: 5_000,
  // Two tabs is a realistic maximum for one person.
  concurrentSockets: 4,
  // Matches the HTTP DTO's MaxLength(5000); the socket path bypasses that
  // pipe, so the bound has to be enforced here or not at all.
  maxTextLength: 5_000,
  maxTargets: 8,
};

type Tally = { minute: number[]; hour: number[]; day: number[] };

@Injectable()
export class LiveRateLimiter implements OnModuleDestroy {
  private readonly logger = new Logger(LiveRateLimiter.name);
  private limits: Limits;
  private readonly tallies = new Map<string, Tally>();
  /** IP → live socket count, decremented on disconnect. */
  private readonly sockets = new Map<string, number>();
  private readonly sweep: NodeJS.Timeout;

  constructor() {
    this.limits = { ...DEFAULT_LIVE_LIMITS };
    // Buckets are pruned on a timer rather than on every request: a public
    // endpoint would otherwise pay a full map scan per message.
    this.sweep = setInterval(() => this.prune(), MINUTE);
    // Never hold the event loop open for a cleanup timer.
    this.sweep.unref?.();
  }

  /** Test/ops hook — tighten or relax the budgets at runtime. */
  configure(overrides: Partial<Limits>): void {
    this.limits = { ...this.limits, ...overrides };
  }

  onModuleDestroy(): void {
    clearInterval(this.sweep);
  }

  /**
   * Admit a socket. Returns false once an IP exceeds its concurrent limit.
   */
  admitSocket(ip: string): boolean {
    const key = ip || 'unknown';
    const current = this.sockets.get(key) ?? 0;
    if (current >= this.limits.concurrentSockets) return false;
    this.sockets.set(key, current + 1);
    return true;
  }

  releaseSocket(ip: string): void {
    const key = ip || 'unknown';
    const current = this.sockets.get(key) ?? 0;
    if (current <= 1) this.sockets.delete(key);
    else this.sockets.set(key, current - 1);
  }

  /**
   * Count one turn against an IP's budgets. Returns true when allowed.
   *
   * The rejected window is reported so the client can be told how long to wait
   * rather than just being cut off.
   */
  consumeTurn(ip: string): { allowed: boolean; retryAfterMs: number } {
    const key = ip || 'unknown';
    const now = Date.now();
    const tally = this.bucket(key, now);

    tally.minute = pruneOlder(tally.minute, now - MINUTE);
    tally.hour = pruneOlder(tally.hour, now - HOUR);
    tally.day = pruneOlder(tally.day, now - DAY);

    if (tally.minute.length >= this.limits.perMinute) {
      return {
        allowed: false,
        retryAfterMs: oldestAge(tally.minute, now - MINUTE),
      };
    }
    if (tally.hour.length >= this.limits.perHour) {
      return {
        allowed: false,
        retryAfterMs: oldestAge(tally.hour, now - HOUR),
      };
    }
    if (tally.day.length >= this.limits.perDay) {
      return { allowed: false, retryAfterMs: oldestAge(tally.day, now - DAY) };
    }

    tally.minute.push(now);
    tally.hour.push(now);
    tally.day.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Cheap shape check run before any translation work is attempted. */
  validate(text: string, targets: string[]): string | null {
    if (text.length > this.limits.maxTextLength) {
      return `Utterance too long (max ${this.limits.maxTextLength} characters).`;
    }
    if (targets.length > this.limits.maxTargets) {
      return `Too many output languages (max ${this.limits.maxTargets}).`;
    }
    return null;
  }

  private bucket(ip: string, now: number): Tally {
    let tally = this.tallies.get(ip);
    if (!tally) {
      tally = { minute: [], hour: [], day: [] };
      this.tallies.set(ip, tally);
    }
    return tally;
  }

  /** Drop IPs with no activity in the last day, so the map cannot grow forever. */
  private prune(): void {
    const cutoff = Date.now() - DAY;
    for (const [ip, tally] of this.tallies) {
      if (tally.day.length === 0 || tally.day[tally.day.length - 1] < cutoff) {
        this.tallies.delete(ip);
      }
    }
    // Socket counts for addresses with no live sockets are dead weight.
    for (const [ip, count] of this.sockets) {
      if (count <= 0) this.sockets.delete(ip);
    }
  }
}

/** Keep only timestamps inside the window. */
const pruneOlder = (stamps: number[], cutoff: number): number[] => stamps.filter((t) => t >= cutoff);

/** How long until the oldest entry in a full window ages out. */
const oldestAge = (stamps: number[], cutoff: number): number => {
  const oldest = stamps[0];
  if (oldest === undefined) return 0;
  // +1000 so a client that waits exactly this long is admitted, not rejected
  // again by a boundary comparison.
  return Math.max(1000, oldest + 1000 - cutoff);
};
