import { Module } from '@nestjs/common';
import { UploadService } from '@/upload/upload.service';
import { UploadController } from '@/upload/upload.controller';
import { PrismaModule } from '@/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
