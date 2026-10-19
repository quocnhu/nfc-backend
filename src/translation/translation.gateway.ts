import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { TranslationService } from '@/translation/translation.service';
import { LiveRateLimiter } from '@/translation/live-rate-limiter';

interface Session {
  fromHint: string[];
  to: string[];
  /** Last detected source — short fragments (< 4 words) are undetectable, so
   * they inherit this instead of trusting a coin-flip guess per snippet. */
  lastDetected?: string | null;
}

/**
 * Normalise the `from` field, which the client may send as a single code, a list of
 * codes, or omit it entirely (auto-detect).
 */
const toHints = (from: string | string[] | undefined, fallback: string[] = []): string[] => {
  if (Array.isArray(from)) return from.filter(Boolean);
  if (typeof from === 'string' && from) return [from];
  return fallback;
};

/**
 * TranslateGateway — realtime translation over Socket.io.
 *
 * Namespace: /translation-live
 *
 * The browser owns speech recognition (Web Speech API), so audio never leaves the
 * client and NestJS only ever sees finished text. That keeps API keys server-side
 * and means no per-frame audio bandwidth.
 *
 * Client → server:
 *   live:start     { from?, to[] }        remember the languages for this session
 *   live:translate { text }               one finished utterance
 *
 * Server → client:
 *   live:ready     {}                     session languages accepted
 *   live:final     { id, text }           utterance locked in (echoed immediately)
 *   live:translation { id, outputs, errors }  translations for that utterance
 *   live:error     { message }            whole turn failed
 *
 * `final` is emitted before translating so the UI can lock the card text the
 * moment the speaker finishes, and fill translations in when they land.
 */
@WebSocketGateway({
  namespace: '/translation-live',
  cors: { origin: true, credentials: true },
})
export class TranslateGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('TranslateGateway');
  private readonly sessions = new Map<string, Session>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly translation: TranslationService,
    private readonly limiter: LiveRateLimiter,
  ) {}

  /**
   * Best-effort client IP. Behind a proxy (Vercel, Render, nginx) the socket
   * address is the proxy's, so the forwarded header is what identifies a real
   * visitor. Falls back to the socket address when absent.
   */
  private ipOf(client: Socket): string {
    const forwarded = client.handshake?.headers?.['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = typeof raw === 'string' ? raw.split(',')[0]?.trim() : '';
    return first || client.handshake?.address || 'unknown';
  }

  handleConnection(client: Socket) {
    // The socket is public by design, so the only thing standing between a
    // stranger and the translation CPU is this admission check.
    if (!this.limiter.admitSocket(this.ipOf(client))) {
      client.emit('live:error', {
        message: 'Too many open translator sessions from this network. Try again shortly.',
      });
      client.disconnect(true);
      return;
    }
    client.data.ip = this.ipOf(client);
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.sessions.delete(client.id);
    const ip = (client.data?.ip as string) || this.ipOf(client);
    this.limiter.releaseSocket(ip);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('live:start')
  onStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() cfg: { from?: string | string[]; to?: string[] } | undefined,
  ) {
    this.sessions.set(client.id, {
      fromHint: toHints(cfg?.from),
      to: (cfg?.to ?? []).filter(Boolean),
    });
    client.emit('live:ready', { to: this.sessions.get(client.id)?.to ?? [] });
  }

  @SubscribeMessage('live:translate')
  async onTranslate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { text?: string; from?: string | string[]; to?: string[] } | undefined,
  ) {
    const session = this.sessions.get(client.id);
    const text = payload?.text?.trim();
    if (!text) return;

    // Per-message languages win so changing targets mid-session works without a restart.
    const fromHint =
      payload?.from !== undefined ? toHints(payload.from) : session?.fromHint ?? [];
    const to = (payload?.to?.length ? payload.to : session?.to ?? []).filter(Boolean);

    // Abuse checks come before the echo, so a rejected turn never reaches the
    // UI as if it had been translated.
    const ip = (client.data?.ip as string) || this.ipOf(client);
    const invalid = this.limiter.validate(text, to);
    if (invalid) {
      client.emit('live:error', { message: invalid });
      return;
    }
    const quota = this.limiter.consumeTurn(ip);
    if (!quota.allowed) {
      const seconds = Math.ceil(quota.retryAfterMs / 1000);
      client.emit('live:error', {
        message: `Translation rate limit reached. Try again in ${seconds}s.`,
      });
      return;
    }

    const id = randomUUID();
    client.emit('live:final', { id, text });

    try {
      const { outputs, errors, romanizations, detectedSource } = await this.translation.translateMany({
        text,
        fromHint,
        to,
      });
      // Language rarely flips on a two-word interjection: trust history over a
      // fresh guess for fragments, and remember whatever we report.
      let detected = detectedSource;
      if (session && text.trim().split(/\s+/).length < 4 && session.lastDetected) {
        detected = session.lastDetected;
      }
      if (session) session.lastDetected = detected ?? session.lastDetected ?? null;
      client.emit('live:translation', { id, outputs, errors, romanizations, detectedSource: detected });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Translation failed';
      client.emit('live:error', { id, message });
    }
  }

  @SubscribeMessage('live:stop')
  onStop(@ConnectedSocket() client: Socket) {
    this.sessions.delete(client.id);
  }
}