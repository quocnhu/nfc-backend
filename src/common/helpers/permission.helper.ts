import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';

type UserPermissionContext = {
  rolePermissions: string[];
  directPermissions: string[];
  mergedPermissions: Set<string>;
  role: string | null;
  createdBy: string | null;
};

const CACHE_TTL_MS = 15_000;

@Injectable()
export class PermissionHelper {
  constructor(private prisma: PrismaService) {}

  private cache = new Map<
    string,
    { data: UserPermissionContext; expiresAt: number }
  >();

  /**
   * Drop cached permissions for one user (or everyone) after role/permission
   * changes. Without an explicit call the 15s TTL bounds staleness.
   */
  invalidate(userId?: string) {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }

  async getUserPermissions(userId: string): Promise<UserPermissionContext> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        userPermissions: { include: { permission: true } },
      },
    });

    let data: UserPermissionContext;
    if (!user || !user.role) {
      data = {
        rolePermissions: [],
        directPermissions: [],
        mergedPermissions: new Set(),
        role: null,
        createdBy: user?.createdBy ?? null,
      };
    } else {
      const rolePermissions = user.role.permissions.map((p) => p.name);
      const directPermissions = user.userPermissions.map((up) => up.permission.name);
      data = {
        rolePermissions,
        directPermissions,
        mergedPermissions: new Set([...rolePermissions, ...directPermissions]),
        role: user.role.name,
        createdBy: user.createdBy,
      };
    }

    this.cache.set(userId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  }

  async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    const { mergedPermissions } = await this.getUserPermissions(userId);
    return mergedPermissions.has(permissionName);
  }

  async isAdmin(userId: string): Promise<boolean> {
    const { role } = await this.getUserPermissions(userId);
    return role?.toUpperCase() === 'ADMIN';
  }
}
