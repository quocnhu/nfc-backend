import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Shared CORS resolution used by BOTH entry points (main.ts for local/dev and
 * serverless.ts for Vercel) so they can never drift apart.
 *
 * DEFAULT_CORS_ORIGIN is the production frontend origin (Vercel). It is the
 * default because serverless.ts — which Vercel actually runs — must accept the
 * production site even when CORS_ORIGIN is not set.
 *
 * CORS_ORIGIN may contain multiple origins separated by commas.
 */
const DEFAULT_CORS_ORIGIN = 'https://quocnhu.vercel.app';

export function resolveCorsOrigins(): string[] {
  return (process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''));
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // Localhost is only trusted outside production. Allowing it in production
    // would let any local process make credentialed requests to the API.
    if (
      process.env.NODE_ENV !== 'production' &&
      (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))
    ) {
      return callback(null, true);
    }
    const allowed = resolveCorsOrigins();
    if (allowed.some((a) => origin === a)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
};
