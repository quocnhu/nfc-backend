import { Module } from '@nestjs/common';
import { RequestMonitorController } from './request-monitor.controller';
import { RequestMonitorService } from './request-monitor.service';

@Module({
  controllers: [RequestMonitorController],
  providers: [RequestMonitorService],
  exports: [RequestMonitorService],
})
export class RequestMonitorModule {}
