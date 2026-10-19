import { Global, Module } from '@nestjs/common';
import { LiveRateLimiter } from '@/translation/live-rate-limiter';

/**
 * RateLimitModule — single shared instance of LiveRateLimiter.
 *
 * Deliberately @Global and provided in exactly one place. Nest instantiates a
 * provider once per module that declares it, so declaring this limiter in both
 * TranslationModule and SharedBoxModule would create two objects with two
 * independent sets of counters — a user would get double the intended quota,
 * and neither module could see the other's traffic.
 */
@Global()
@Module({
  providers: [LiveRateLimiter],
  exports: [LiveRateLimiter],
})
export class RateLimitModule {}
