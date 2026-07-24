import { Global, Module } from '@nestjs/common';
import { PermissionHelper } from '@/common/helpers/permission.helper';

@Global()
@Module({
  providers: [PermissionHelper],
  exports: [PermissionHelper],
})
export class PermissionHelperModule {}
