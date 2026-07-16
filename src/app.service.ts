import { Injectable } from '@nestjs/common';
import { PrismaService } from './database/prisma/prisma.service';
import { responseOk } from './common/helpers/response.helper';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello() {
    return responseOk('NestJS + Prisma + Supabase is running.');
  }

  async checkDbConnection() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return responseOk('Connected to Supabase Postgres via Prisma');
    } catch (error) {
      return responseOk('Database connection failed');
    }
  }
}
