import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { responseOk } from '../common/helpers/response.helper';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

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
      user: { id: user.id, email: user.email, fullname: user.fullname },
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
      user: { id: user.id, email: user.email, fullname: user.fullname },
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
}
