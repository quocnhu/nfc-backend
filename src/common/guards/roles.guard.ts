import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@/database/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { IS_PUBLIC_WITH_SUBSCRIPTION_KEY } from '@/common/decorators/public-with-subscription.decorator';
import { PermissionHelper } from '@/common/helpers/permission.helper';
import { derivePermission } from '@/common/helpers/permission-derivation';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private permissionHelper: PermissionHelper,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isPublicWithSubscription = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_WITH_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Allow anonymous access for @PublicWithSubscription() routes
    if (isPublicWithSubscription && !user) return true;
    
    if (!user) return false;

    if (this.isSelfServiceRoute(request.route?.path || '')) {
      return true;
    }

    const requiredPermission = derivePermission(
      context.getClass(),
      request.method,
      request.route?.path || '',
    );

    const { mergedPermissions } = await this.permissionHelper.getUserPermissions(user.sub);

    if (mergedPermissions.has(requiredPermission)) {
      return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }

  private isSelfServiceRoute(path: string): boolean {
    const segments = path.split('/').filter(Boolean);
    if (segments.some((s) => s === 'me' || s === 'public')) return true;
    if (path.endsWith('/dashboard/permissions')) return true;
    if (
      path.includes('/payment/create-order') ||
      path.includes('/payment/capture') ||
      path.includes('/payment/status') ||
      path.includes('/payment/my-payments') ||
      path.includes('/payment/plans')
    )
      return true;
    return false;
  }
}
