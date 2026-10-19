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
import { ipFromSocket } from '@/common/utils/client-ip';

/**
 * LiveBoxGateway — pushes new sentences to everyone watching a shared box.
 *
 * Namespace: /shared-box
 *
 * Two roles share one box and must see each other's additions:
 *
 *   box:join     { token }        join the room for a share token
 *   box:leave    { token }        leave it
 *
 * Server → client:
 *   box:sentence { sentence }     someone added a sentence
 *   box:presence { count }        how many are currently looking
 *
 * Presence is included because the point of the box is conversation: knowing
 * the other person is there is most of the value, and it costs one counter.
 *
 * Reads are driven by the caller joining and leaving only — the socket never
 * accepts sentence text. Sentences are POSTed over HTTP instead, so they pass
 * through validation, rate limiting and the translation service in one place
 * rather than being duplicated in a websocket handler.
 */
@WebSocketGateway({
  namespace: '/shared-box',
  cors: { origin: true, credentials: true },
})
export class LiveBoxGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('LiveBoxGateway');
  /** token → set of socket ids, so presence is a count and leave is precise. */
  private readonly rooms = new Map<string, Set<string>>();

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Box watcher connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // A dropped socket must not keep a phantom viewer in the count.
    for (const [token, members] of this.rooms) {
      if (members.delete(client.id)) {
        if (members.size === 0) this.rooms.delete(token);
        this.emitPresence(token);
      }
    }
  }

  @SubscribeMessage('box:join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { token?: string } | undefined,
  ) {
    const token = payload?.token?.trim();
    if (!token) return;

    await client.join(this.room(token));
    const members = this.rooms.get(token) ?? new Set<string>();
    members.add(client.id);
    this.rooms.set(token, members);

    this.emitPresence(token);
  }

  @SubscribeMessage('box:leave')
  async onLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { token?: string } | undefined,
  ) {
    const token = payload?.token?.trim();
    if (!token) return;
    await client.leave(this.room(token));
    const members = this.rooms.get(token);
    if (members) {
      members.delete(client.id);
      if (members.size === 0) this.rooms.delete(token);
    }
    this.emitPresence(token);
  }

  /** Tell every watcher of a box that a sentence landed. */
  broadcastSentence(token: string, sentence: unknown): void {
    this.server?.to(this.room(token)).emit('box:sentence', { sentence });
  }

  /** IP of a connected watcher — kept for parity with the HTTP limiter. */
  ipOf(client: Socket): string {
    return ipFromSocket(client);
  }

  private room(token: string): string {
    return `box:${token}`;
  }

  private emitPresence(token: string): void {
    const count = this.rooms.get(token)?.size ?? 0;
    this.server?.to(this.room(token)).emit('box:presence', { count });
  }
}
