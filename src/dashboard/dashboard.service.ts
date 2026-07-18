import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { responseOk } from '../common/helpers/response.helper';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  /**
   * getStats — Get aggregate counts for the dashboard stat cards.
   * Queries all 5 tables in parallel for performance.
   * Returns: totalUsers, totalRoles, totalPermissions, totalSharingContent, totalHistories.
   */
  async getStats() {
    const [totalUsers, totalRoles, totalPermissions, totalSharingContent, totalHistories] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.role.count(),
        this.prisma.permission.count(),
        this.prisma.sharingContent.count(),
        this.prisma.history.count(),
      ]);

    return responseOk('Dashboard stats fetched successfully', {
      totalUsers,
      totalRoles,
      totalPermissions,
      totalSharingContent,
      totalHistories,
    });
  }

  /**
   * getUserPermissions — Get a full permissions breakdown for the logged-in user.
   * 1. Fetch user with role permissions and individual permissions.
   * 2. Merge role-based and user-level permissions into a unique set.
   * Returns: user info, role name, rolePermissions, directPermissions, mergedPermissions.
   */
  async getUserPermissions(userId: string) {
    // Step 1: Fetch user with all permission relations
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: { permissions: true },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) return responseOk('User not found', null);

    // Step 2: Separate and merge permissions
    const rolePerms = user.role.permissions.map((p) => p.name);
    const userPerms = user.userPermissions.map((up) => up.permission.name);
    const mergedPermissions = [...new Set([...rolePerms, ...userPerms])];

    return responseOk('User permissions fetched successfully', {
      user: { id: user.id, email: user.email, fullname: user.fullname, avatarUrl: user.avatarUrl },
      role: user.role.name,
      rolePermissions: rolePerms,
      directPermissions: userPerms,
      mergedPermissions,
    });
  }

  /**
   * getRecentActivity — Get recent history entries for the dashboard.
   */
  async getRecentActivity(limit: number = 20) {
    const activities = await this.prisma.history.findMany({
      include: { user: { select: { id: true, fullname: true, email: true } } },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return responseOk('Recent activity fetched successfully', activities);
  }

  /**
   * getUserPermissionsById — Get any user's permissions breakdown (admin use).
   */
  async getUserPermissionsById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        userPermissions: { include: { permission: true } },
      },
    });

    if (!user) return responseOk('User not found', null);

    const rolePerms = user.role.permissions.map((p) => p.name);
    const userPerms = user.userPermissions.map((up) => up.permission.name);
    const mergedPermissions = [...new Set([...rolePerms, ...userPerms])];

    return responseOk('User permissions fetched successfully', {
      user: { id: user.id, email: user.email, fullname: user.fullname, avatarUrl: user.avatarUrl },
      role: user.role.name,
      rolePermissions: rolePerms,
      directPermissions: userPerms,
      mergedPermissions,
    });
  }

  /**
   * getUsersByRole — Get all users grouped by role.
   */
  async getUsersByRole() {
    const roles = await this.prisma.role.findMany({
      include: {
        users: {
          select: { id: true, email: true, fullname: true },
        },
      },
    });

    return responseOk('Users by role fetched successfully', roles);
  }

  async getSuspiciousActivity() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      failedByIp,
      failedByEmail,
      recentFailedCount,
      recentSuccessCount,
      permissionChanges,
      deletions,
    ] = await Promise.all([
      this.authService.getFailedLoginAttemptsByIp(oneHourAgo),
      this.authService.getFailedLoginAttemptsByEmail(oneHourAgo),
      this.prisma.loginAttempt.count({ where: { success: false, timestamp: { gte: oneHourAgo } } }),
      this.prisma.loginAttempt.count({ where: { success: true, timestamp: { gte: oneHourAgo } } }),
      this.prisma.history.findMany({
        where: {
          OR: [
            { action: { contains: 'update:permission' } },
            { action: { contains: 'update:role' } },
            { action: { contains: 'assign-permissions' } },
          ],
          timestamp: { gte: oneDayAgo },
        },
        include: { user: { select: { id: true, fullname: true, email: true } } },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
      this.prisma.history.findMany({
        where: {
          action: { contains: 'delete:' },
          timestamp: { gte: oneDayAgo },
        },
        include: { user: { select: { id: true, fullname: true, email: true } } },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
    ]);

    const alerts: any[] = [];

    failedByIp.forEach((entry: any) => {
      if (entry._count.id >= 5) {
        alerts.push({
          type: 'brute_force_ip',
          severity: 'high',
          message: `${entry._count.id} failed login attempts from IP ${entry.ip} in the last hour`,
          count: entry._count.id,
          ip: entry.ip,
          timestamp: new Date().toISOString(),
        });
      }
    });

    failedByEmail.forEach((entry: any) => {
      if (entry._count.id >= 5) {
        alerts.push({
          type: 'brute_force_account',
          severity: 'high',
          message: `${entry._count.id} failed login attempts for ${entry.email} in the last hour`,
          count: entry._count.id,
          email: entry.email,
          timestamp: new Date().toISOString(),
        });
      }
    });

    if (recentFailedCount >= 20) {
      alerts.push({
        type: 'high_failure_rate',
        severity: 'medium',
        message: `${recentFailedCount} failed logins in the last hour (${recentSuccessCount} successful)`,
        failedCount: recentFailedCount,
        successCount: recentSuccessCount,
        timestamp: new Date().toISOString(),
      });
    }

    permissionChanges.forEach((entry: any) => {
      alerts.push({
        type: 'permission_change',
        severity: 'medium',
        message: `${entry.user?.fullname || 'Unknown'} modified permissions — ${entry.details || ''}`,
        user: entry.user,
        timestamp: entry.timestamp,
      });
    });

    deletions.forEach((entry: any) => {
      alerts.push({
        type: 'deletion',
        severity: entry.action.includes('delete:user') ? 'high' : 'low',
        message: `${entry.user?.fullname || 'Unknown'} deleted a resource — ${entry.details || ''}`,
        user: entry.user,
        timestamp: entry.timestamp,
      });
    });

    alerts.sort((a, b) => {
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    });

    return responseOk('Suspicious activity fetched', {
      alerts,
      summary: {
        failedLoginsLastHour: recentFailedCount,
        successfulLoginsLastHour: recentSuccessCount,
        alertsCount: alerts.filter((a) => a.severity === 'high').length,
      },
    });
  }
}
