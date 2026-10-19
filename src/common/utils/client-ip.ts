import type { Request } from 'express';
import type { Socket } from 'socket.io';

/**
 * clientIp — the caller's address, honouring the reverse proxy.
 *
 * Both the HTTP endpoints and the websocket need this, and both need the same
 * answer: behind Vercel, Render or nginx the immediate peer is the proxy, so
 * every visitor would otherwise share one identity. That matters especially
 * for rate limiting — one bucket per proxy would let the first visitor lock
 * everyone else out, and would let a single abuser exhaust the budget for all.
 *
 * `x-forwarded-for` is a comma-separated chain, client first, so index 0 is the
 * caller. Falls back to the direct socket/connection address when a request
 * arrives without the header.
 */
export function clientIpFromHeaders(
  headers: Record<string, unknown> | undefined,
  fallback: string,
): string {
  const forwarded = headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = typeof raw === 'string' ? raw.split(',')[0]?.trim() : '';
  return first || fallback || 'unknown';
}

export function ipFromRequest(req: Request): string {
  return clientIpFromHeaders(req?.headers, req?.socket?.remoteAddress ?? 'unknown');
}

export function ipFromSocket(client: Socket): string {
  return clientIpFromHeaders(client?.handshake?.headers, client?.handshake?.address ?? 'unknown');
}
