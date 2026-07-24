import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@/database/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { SKIP_SUBSCRIPTION_KEY } from '@/common/decorators/skip-subscription.decorator';
import { PermissionHelper } from '@/common/helpers/permission.helper';
import { derivePermission } from '@/common/helpers/permission-derivation';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
    private permissionHelper: PermissionHelper,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      request.subscriptionStatus = 'PUBLIC';
      request.planName = 'PUBLIC';
      return true;
    }

    const skipSubscription = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipSubscription) {
      request.subscriptionStatus = 'SKIPPED';
      request.planName = 'SKIPPED';
      return true;
    }

    const user = request.user;
    if (!user) return false;

    if (await this.permissionHelper.isAdmin(user.sub)) {
      request.subscriptionStatus = 'ADMIN';
      request.planName = 'ADMIN';
      return true;
    }

    const path = request.route?.path || '';
    if (
      path.includes('/payment/create-order') ||
      path.includes('/payment/capture') ||
      path.includes('/payment/status') ||
      path.includes('/payment/public-status') ||
      path.includes('/payment/plans') ||
      path.includes('/payment/my-payments') ||
      path.includes('/payment/admin-change-plan') ||
      path.includes('/payment/cancel-subscription') ||
      path.includes('/payment/cleanup-expired') ||
      path.includes('/dashboard/permissions') ||
      path.includes('/users/me')
    ) {
      request.subscriptionStatus = 'PAYMENT';
      request.planName = 'PAYMENT';
      return true;
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { createdBy: true },
    });

    if (currentUser?.createdBy) {
      request.subscriptionStatus = 'COMPANY';
      request.planName = 'COMPANY';
      return true;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId: user.sub,
        isCurrent: true,
      },
      include: {
        plan: {
          include: {
            planPermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!subscription) {
      throw new ForbiddenException(
        'No active subscription found. Please upgrade your plan to continue.',
      );
    }

    const now = new Date();
    const isExpired =
      subscription.status === 'EXPIRED' ||
      subscription.status === 'CANCELLED' ||
      subscription.status === 'PAST_DUE' ||
      subscription.endDate < now;

    if (isExpired) {
      throw new ForbiddenException(
        'Your subscription has expired. Please upgrade your plan to continue.',
      );
    }

    const requiredPermission = derivePermission(
      context.getClass(),
      request.method,
      request.route?.path || '',
    );

    if (!subscription.plan) {
      throw new ForbiddenException('No plan associated with your subscription.');
    }

    const planPermissions = new Set(
      subscription.plan.planPermissions.map((pp) => pp.permission.name),
    );

    if (planPermissions.has(requiredPermission)) {
      request.subscriptionStatus = subscription.status;
      request.planName = subscription.plan.name;
      return true;
    }

    throw new ForbiddenException(
      `Your plan (${subscription.plan.displayName}) does not include this feature. Please upgrade.`,
    );
  }
}
