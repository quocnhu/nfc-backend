import { Controller, Get, Query, Param } from '@nestjs/common';
import { DashboardService } from '@/dashboard/dashboard.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { SkipSubscription } from '@/common/decorators/skip-subscription.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('requests')
  getRequestCounts() {
    return this.dashboardService.getRequestCounts();
  }

  @Get('permissions')
  @SkipSubscription()
  getUserPermissions(@CurrentUser('sub') userId: string) {
    return this.dashboardService.getUserPermissions(userId);
  }

  @Get('activity')
  getRecentActivity(@Query('limit') limit?: string) {
    return this.dashboardService.getRecentActivity(limit ? parseInt(limit, 10) : 20);
  }

  @Get('permissions/:userId')
  getUserPermissionsById(@Param('userId') userId: string) {
    return this.dashboardService.getUserPermissionsById(userId);
  }

  @Get('users-by-role')
  getUsersByRole() {
    return this.dashboardService.getUsersByRole();
  }

  @Get('subscriptions')
  getSubscriptionStats(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.dashboardService.getSubscriptionStats(startDate, endDate);
  }

  @Get('payments')
  getPaymentStats(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.dashboardService.getPaymentStats(startDate, endDate);
  }

  @Get('growth')
  getGrowthData() {
    return this.dashboardService.getGrowthData();
  }

  @Get('suspicious')
  getSuspiciousActivity() {
    return this.dashboardService.getSuspiciousActivity();
  }
}
