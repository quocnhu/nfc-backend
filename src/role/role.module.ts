import { Module } from '@nestjs/common';
import { RoleService } from '@/role/role.service';
import { RoleController } from '@/role/role.controller';

@Module({
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
