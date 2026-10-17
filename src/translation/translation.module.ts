import { Module } from '@nestjs/common';
import { TranslationService } from '@/translation/translation.service';
import { TranslationController } from '@/translation/translation.controller';
import { TranslateGateway } from '@/translation/translation.gateway';

@Module({
  controllers: [TranslationController],
  providers: [TranslationService, TranslateGateway],
})
export class TranslationModule {}