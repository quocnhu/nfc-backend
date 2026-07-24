import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from '@/auth/auth.service';
import { AuthController } from '@/auth/auth.controller';
import { JwtStrategy } from '@/auth/passport/jwt.strategy';
import { PrismaModule } from '@/database/prisma/prisma.module';

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

//npm install @nestjs/passport passport passport-jwt @nestjs/jwt bcrypt class-validator class-transformer
//npm install -D @types/passport-jwt @types/bcrypt