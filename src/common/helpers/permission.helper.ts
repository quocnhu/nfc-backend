import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';

@Injectable()
export class PermissionHelper {
  constructor(private prisma: PrismaService) {}

  async getUserPermissions(userId: string): Promise<{
    rolePermissions: string[];
    directPermissions: string[];
    mergedPermissions: Set<string>;
    role: string | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        userPermissions: { include: { permission: true } },
      },
    });

    if (!user || !user.role) {
      return {
        rolePermissions: [],
        directPermissions: [],
        mergedPermissions: new Set(),
        role: null,
      };
    }

    const rolePermissions = user.role.permissions.map((p) => p.name);
    const directPermissions = user.userPermissions.map((up) => up.permission.name);
    const mergedPermissions = new Set([...rolePermissions, ...directPermissions]);

    return {
      rolePermissions,
      directPermissions,
      mergedPermissions,
      role: user.role.name,
    };
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
