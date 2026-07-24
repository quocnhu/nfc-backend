import { Module } from '@nestjs/common';
import { PermissionService } from '@/permission/permission.service';
import { PermissionController } from '@/permission/permission.controller';

@Module({
  controllers: [PermissionController],
  providers: [PermissionService],
})
export class PermissionModule {}
