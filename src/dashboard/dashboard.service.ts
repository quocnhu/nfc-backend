import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { AuthService } from '@/auth/auth.service';
import { responseOk } from '@/common/helpers/response.helper';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

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

  async getRequestCounts() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [todayCount, monthCount, yearCount] = await Promise.all([
      this.prisma.history.count({
        where: { action: 'read:publicview', timestamp: { gte: startOfDay } },
      }),
      this.prisma.history.count({
        where: { action: 'read:publicview', timestamp: { gte: startOfMonth } },
      }),
      this.prisma.history.count({
        where: { action: 'read:publicview', timestamp: { gte: startOfYear } },
      }),
    ]);

    return responseOk('Request counts fetched successfully', {
      today: todayCount,
      month: monthCount,
      year: yearCount,
    });
  }

  async getUserPermissions(userId: string) {
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

  async getRecentActivity(limit: number = 20) {
    const activities = await this.prisma.history.findMany({
      include: { user: { select: { id: true, fullname: true, email: true } } },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return responseOk('Recent activity fetched successfully', activities);
  }

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

  async getSubscriptionStats(startDate?: string, endDate?: string) {
    const now = new Date();
    let dateFilter: any = {};

    if (startDate) {
      dateFilter.createdAt = { ...dateFilter.createdAt, gte: new Date(startDate) };
    }
    if (endDate) {
      dateFilter.createdAt = { ...dateFilter.createdAt, lte: new Date(endDate) };
    }

    const where = Object.keys(dateFilter).length > 0 ? dateFilter : {};

    const [totalSubscriptions, activeCount, expiredCount, trialCount] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.count({ where: { ...where, status: 'ACTIVE', isCurrent: true } }),
      this.prisma.subscription.count({ where: { ...where, status: 'EXPIRED' } }),
      this.prisma.subscription.count({ where: { ...where, status: 'TRIAL' } }),
    ]);

    return responseOk('Subscription stats fetched successfully', {
      total: totalSubscriptions,
      active: activeCount,
      expired: expiredCount,
      trial: trialCount,
      startDate: startDate || null,
      endDate: endDate || null,
    });
  }

  async getPaymentStats(startDate?: string, endDate?: string) {
    const now = new Date();
    let dateFilter: any = {};

    if (startDate) {
      dateFilter.createdAt = { ...dateFilter.createdAt, gte: new Date(startDate) };
    }
    if (endDate) {
      dateFilter.createdAt = { ...dateFilter.createdAt, lte: new Date(endDate) };
    }

    const where = Object.keys(dateFilter).length > 0 ? dateFilter : {};

    const [totalPayments, completedCount, totalRevenue] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.payment.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return responseOk('Payment stats fetched successfully', {
      total: totalPayments,
      completed: completedCount,
      revenue: totalRevenue._sum.amount || 0,
      startDate: startDate || null,
      endDate: endDate || null,
    });
  }

  async getGrowthData() {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const subscriptions = await this.prisma.subscription.findMany({
      where: { createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    const payments = await this.prisma.payment.findMany({
      where: { createdAt: { gte: twelveMonthsAgo }, status: 'COMPLETED' },
      select: { createdAt: true, amount: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthlyData: Record<string, { subscriptions: number; revenue: number }> = {};

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = { subscriptions: 0, revenue: 0 };
    }

    subscriptions.forEach((sub) => {
      const date = new Date(sub.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[key]) {
        monthlyData[key].subscriptions++;
      }
    });

    payments.forEach((payment) => {
      const date = new Date(payment.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[key]) {
        monthlyData[key].revenue += payment.amount;
      }
    });

    const labels = Object.keys(monthlyData);
    const subscriptionData = labels.map((label) => monthlyData[label].subscriptions);
    const revenueData = labels.map((label) => monthlyData[label].revenue);

    return responseOk('Growth data fetched successfully', {
      labels,
      subscriptionData,
      revenueData,
    });
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
