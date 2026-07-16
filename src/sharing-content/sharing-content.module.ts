import { Module } from '@nestjs/common';
import { SharingContentService } from './sharing-content.service';
import { SharingContentController } from './sharing-content.controller';

@Module({
  controllers: [SharingContentController],
  providers: [SharingContentService],
  exports: [SharingContentService],
})
export class SharingContentModule {}
