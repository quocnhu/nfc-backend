import { Module } from '@nestjs/common';
import { TranslationService } from '@/translation/translation.service';
import { TranslationController } from '@/translation/translation.controller';

@Module({
  controllers: [TranslationController],
  providers: [TranslationService],
})
export class TranslationModule {}