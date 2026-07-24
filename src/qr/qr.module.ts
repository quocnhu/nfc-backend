import { Module } from '@nestjs/common';
import { QRService } from '@/qr/qr.service';
import { QRController } from '@/qr/qr.controller';

@Module({
  controllers: [QRController],
  providers: [QRService],
})
export class QRModule {}
