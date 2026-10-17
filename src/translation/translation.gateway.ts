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

  constructor(private readonly translation: TranslationService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.sessions.delete(client.id);
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