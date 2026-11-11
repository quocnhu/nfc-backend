import { Module } from '@nestjs/common';
import { SharingContentService } from '@/sharing-content/sharing-content.service';
import { SharingContentController } from '@/sharing-content/sharing-content.controller';
import { TemplateModule } from '@/template/template.module';

@Module({
  imports: [TemplateModule],
  controllers: [SharingContentController],
  providers: [SharingContentService],
  exports: [SharingContentService],
})
export class SharingContentModule {}
