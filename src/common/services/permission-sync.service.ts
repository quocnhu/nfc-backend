import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PrismaService } from '@/database/prisma/prisma.service';
import { derivePermission } from '@/common/helpers/permission-derivation';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';

@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(
    private discoveryService: DiscoveryService,
    private metadataScanner: MetadataScanner,
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting permission auto-sync...');
    await this.syncPermissions();
  }

  private async syncPermissions() {
    try {
      const requiredPermissions = this.extractPermissionsFromControllers();
      
      if (requiredPermissions.size === 0) {
        this.logger.log('No permissions to sync');
        return;
      }

      this.logger.log(`Found ${requiredPermissions.size} required permissions`);

      // Get existing permissions
      const existingPermissions = await this.prisma.permission.findMany({
        select: { name: true },
      });
      const existingPermissionNames = new Set(existingPermissions.map(p => p.name));

      // Find missing permissions
      const missingPermissions = Array.from(requiredPermissions).filter(
        perm => !existingPermissionNames.has(perm)
      );

      if (missingPermissions.length === 0) {
        this.logger.log('All permissions already exist in database');
        return;
      }

      this.logger.log(`Creating ${missingPermissions.length} missing permissions`);

      // Create missing permissions
      const createdPermissions = await this.prisma.permission.createMany({
        data: missingPermissions.map(name => ({ name })),
        skipDuplicates: true,
      });

      this.logger.log(`Created ${createdPermissions.count} new permissions`);

      // Assign new permissions to ADMIN role
      await this.assignPermissionsToAdminRole(missingPermissions);

    } catch (error) {
      this.logger.error('Failed to sync permissions', error);
    }
  }

  private extractPermissionsFromControllers(): Set<string> {
    const permissions = new Set<string>();
    const controllers = this.discoveryService.getControllers();

    const httpMethodMap: Record<string, string> = {
      '0': 'GET',
      '1': 'POST',
      '2': 'PUT',
      '3': 'DELETE',
      '4': 'PATCH',
    };

    for (const wrapper of controllers) {
      const { instance, metatype } = wrapper;
      
      if (!instance || !metatype) continue;
      
      // Skip if no prototype
      if (!Object.getPrototypeOf(instance)) continue;

      // Get controller path
      const controllerPath = this.reflector.get<string>(PATH_METADATA, metatype) || '';
      
      // Get all method names from the controller prototype
      const prototype = Object.getPrototypeOf(instance);
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const handler = prototype[methodName];
        
        // Get route metadata
        const routePath = this.reflector.get<string>(PATH_METADATA, handler);
        const routeMethod = this.reflector.get<string>(METHOD_METADATA, handler);

        if (routePath && routeMethod) {
          // Construct full path with controller prefix
          // Handle empty routePath, leading slashes, and ensure proper formatting
          const cleanRoutePath = routePath.startsWith('/') ? routePath.slice(1) : routePath;
          const normalizedRoutePath = cleanRoutePath === '' ? '' : `/${cleanRoutePath}`;
          const fullPath = controllerPath ? `/${controllerPath}${normalizedRoutePath}` : (cleanRoutePath === '' ? '/' : `/${cleanRoutePath}`);
          const method = httpMethodMap[routeMethod] || 'GET';
          
          // Derive permission
          const permission = derivePermission(metatype, method, fullPath);
          permissions.add(permission);
        }
      }
    }

    return permissions;
  }

  private async assignPermissionsToAdminRole(permissionNames: string[]) {
    try {
      // Find ADMIN role
      const adminRole = await this.prisma.role.findUnique({
        where: { name: 'ADMIN' },
      });

      if (!adminRole) {
        this.logger.warn('ADMIN role not found, skipping permission assignment');
        return;
      }

      // Get the permission IDs
      const permissions = await this.prisma.permission.findMany({
        where: { name: { in: permissionNames } },
        select: { id: true },
      });

      if (permissions.length === 0) {
        this.logger.warn('No permissions found to assign');
        return;
      }

      // Check which permissions are already assigned to ADMIN
      const existingRolePermissions = await this.prisma.role.findUnique({
        where: { id: adminRole.id },
        include: { permissions: true },
      });

      const existingPermissionIds = new Set(
        existingRolePermissions?.permissions.map(p => p.id) || []
      );

      // Filter out already assigned permissions
      const newPermissionIds = permissions
        .map(p => p.id)
        .filter(id => !existingPermissionIds.has(id));

      if (newPermissionIds.length === 0) {
        this.logger.log('All new permissions already assigned to ADMIN role');
        return;
      }

      // Assign new permissions to ADMIN role
      await this.prisma.role.update({
        where: { id: adminRole.id },
        data: {
          permissions: {
            connect: newPermissionIds.map(id => ({ id })),
          },
        },
      });

      this.logger.log(`Assigned ${newPermissionIds.length} new permissions to ADMIN role`);

    } catch (error) {
      this.logger.error('Failed to assign permissions to ADMIN role', error);
    }
  }
}
