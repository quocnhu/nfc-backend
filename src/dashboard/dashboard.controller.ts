import { Controller, Get, Query, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  /**
   * GET /dashboard/stats — Get summary statistics for the dashboard.
   * Returns counts: totalUsers, totalRoles, totalPermissions, totalSharingContent, totalHistories.
   * Used by the frontend to render stat cards on the dashboard page.
   */
  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }

  /**
   * GET /dashboard/permissions — Get the logged-in user's permissions breakdown.
   * Returns: user info, role name, rolePermissions, directPermissions, mergedPermissions.
   * Used by the frontend to show which permissions the current user has.
   */
  @Get('permissions')
  getUserPermissions(@CurrentUser('sub') userId: string) {
    return this.dashboardService.getUserPermissions(userId);
  }

  /**
   * GET /dashboard/activity — Get recent activity (history) for the dashboard.
   * Query param: ?limit=20 (default: 20).
   * Returns the latest history entries with user info.
   */
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
}
