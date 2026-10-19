import { Module } from '@nestjs/common';
import { SharedBoxService } from '@/shared-box/shared-box.service';
import { SharedBoxController } from '@/shared-box/shared-box.controller';
import { LiveBoxGateway } from '@/shared-box/shared-box.gateway';
import { TranslationModule } from '@/translation/translation.module';

/**
 * SharedBoxModule — learning boxes opened to anonymous visitors.
 *
 * TranslationModule is imported so the shared-box service translates guest
 * sentences through exactly the same chain the owner uses, rather than a second
 * code path that could drift.
 *
 * LiveRateLimiter comes from the global RateLimitModule, so the public write
 * endpoint and the live translator share one set of per-IP counters.
 */
@Module({
  imports: [TranslationModule],
  controllers: [SharedBoxController],
  providers: [SharedBoxService, LiveBoxGateway],
})
export class SharedBoxModule {}
