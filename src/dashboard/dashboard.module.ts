import { Module } from '@nestjs/common';
import { DashboardService } from '@/dashboard/dashboard.service';
import { DashboardController } from '@/dashboard/dashboard.controller';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
