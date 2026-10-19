import { Module } from '@nestjs/common';
import { TranslationService } from '@/translation/translation.service';
import { TranslationController } from '@/translation/translation.controller';
import { TranslateGateway } from '@/translation/translation.gateway';
// LiveRateLimiter comes from the global RateLimitModule so the live socket and
// the public shared-box endpoint meter the same visitor against one budget.

@Module({
  controllers: [TranslationController],
  providers: [TranslationService, TranslateGateway],
  // Exported so SharedBoxModule can translate a guest's sentence through the
  // exact same chain the owner uses, instead of reimplementing it.
  exports: [TranslationService],
})
export class TranslationModule {}