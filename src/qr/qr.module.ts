import { Module } from '@nestjs/common';
import { QRService } from './qr.service';
import { QRController } from './qr.controller';

@Module({
  controllers: [QRController],
  providers: [QRService],
})
export class QRModule {}
