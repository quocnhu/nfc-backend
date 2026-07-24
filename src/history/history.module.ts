import { Module } from '@nestjs/common';
import { HistoryService } from '@/history/history.service';
import { HistoryController } from '@/history/history.controller';

@Module({
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
