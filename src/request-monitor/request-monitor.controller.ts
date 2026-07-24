import { Controller, Get, Query } from '@nestjs/common';
import { RequestMonitorService } from './request-monitor.service';

@Controller('dashboard/monitor')
export class RequestMonitorController {
  constructor(private requestMonitorService: RequestMonitorService) {}

  @Get('counts')
  getRequestCounts() {
    return this.requestMonitorService.getRequestCounts();
  }

  @Get('protected')
  getProtectedRouteStats() {
    return this.requestMonitorService.getProtectedRouteStats();
  }

  @Get('top-routes')
  getTopRoutes(@Query('limit') limit?: string) {
    return this.requestMonitorService.getTopRoutes(limit ? parseInt(limit, 10) : 10);
  }

  @Get('top-protected-routes')
  getTopProtectedRoutes(@Query('limit') limit?: string) {
    return this.requestMonitorService.getTopProtectedRoutes(limit ? parseInt(limit, 10) : 10);
  }

  @Get('plan-usage')
  getPlanUsage() {
    return this.requestMonitorService.getPlanUsage();
  }

  @Get('subscription-status')
  getSubscriptionStatusBreakdown() {
    return this.requestMonitorService.getSubscriptionStatusBreakdown();
  }

  @Get('response-time')
  getAverageResponseTime() {
    return this.requestMonitorService.getAverageResponseTime();
  }
}
