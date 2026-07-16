import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController, UserSelfController } from './user.controller';

@Module({
  controllers: [UserController, UserSelfController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
