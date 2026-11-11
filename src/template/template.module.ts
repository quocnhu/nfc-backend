import { Module } from '@nestjs/common';
import { TemplateService } from '@/template/template.service';
import { TemplateController } from '@/template/template.controller';

@Module({
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
