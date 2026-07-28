import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { PaypalConfig } from '@/payment/paypal.config';
import { ConfigService } from '@nestjs/config';
import * as paypal from '@paypal/checkout-server-sdk';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { derivePermission } from '@/common/helpers/permission-derivation';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private paypalConfig: PaypalConfig,
    private config: ConfigService,
    private discoveryService: DiscoveryService,
    private metadataScanner: MetadataScanner,
    private reflector: Reflector,
  ) {}

  async getPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      include: {
        planPermissions: {
          include: { permission: true },
        },
      },
      orderBy: { price: 'asc' },
    });
    return responseOk('Plans fetched successfully', plans);
  }

  async getAllPlans() {
    const plans = await this.prisma.plan.findMany({
      include: {
        planPermissions: {
          include: { permission: true },
        },
        _count: {
          select: { subscriptions: true, payments: true },
        },
      },
      orderBy: { price: 'asc' },
    });
    return responseOk('All plans fetched successfully', plans);
  }

  async createPlan(data: { name: string; displayName: string; description?: string; features?: string[]; price: number; currency?: string; durationDays: number; isActive?: boolean; permissionIds?: string[] }) {
    const existing = await this.prisma.plan.findFirst({ 
      where: { name: { mode: 'insensitive', equals: data.name } } 
    });
    if (existing) {
      throw new BadRequestException('Plan name already exists');
    }

    const plan = await this.prisma.plan.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        features: data.features || [],
        price: data.price,
        currency: data.currency || 'USD',
        durationDays: data.durationDays,
        isActive: data.isActive ?? true,
        planPermissions: data.permissionIds
          ? {
              create: data.permissionIds.map((permissionId) => ({ permissionId })),
            }
          : undefined,
      },
      include: {
        planPermissions: {
          include: { permission: true },
        },
      },
    });

    return responseCreated('Plan created successfully', plan);
  }

  async updatePlan(id: string, data: { name?: string; displayName?: string; description?: string; features?: string[]; price?: number; currency?: string; durationDays?: number; isActive?: boolean; permissionIds?: string[] }) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (data.name && data.name.toUpperCase() !== plan.name.toUpperCase()) {
      const existing = await this.prisma.plan.findFirst({ 
        where: { name: { mode: 'insensitive', equals: data.name } } 
      });
      if (existing) {
        throw new BadRequestException('Plan name already exists');
      }
    }

    if (data.permissionIds) {
      await this.prisma.planPermission.deleteMany({ where: { planId: id } });
      if (data.permissionIds.length > 0) {
        await this.prisma.planPermission.createMany({
          data: data.permissionIds.map((permissionId) => ({ planId: id, permissionId })),
        });
      }
    }

    const { permissionIds, features, ...planData } = data;
    
    // Handle features field separately for JSON type
    const updateData: any = { ...planData };
    if (features !== undefined) {
      updateData.features = features;
    }
    
    const updated = await this.prisma.plan.update({
      where: { id },
      data: updateData,
      include: {
        planPermissions: {
          include: { permission: true },
        },
      },
    });

    return responseOk('Plan updated successfully', updated);
  }

  async deletePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan._count.subscriptions > 0) {
      throw new BadRequestException('Cannot delete plan with active subscriptions');
    }

    await this.prisma.plan.delete({ where: { id } });
    return responseOk('Plan deleted successfully', null);
  }

  async bulkDeletePlans(ids: string[]) {
    if (!ids.length) throw new NotFoundException('No IDs provided');

    const plans = await this.prisma.plan.findMany({
      where: { id: { in: ids } },
      include: { _count: { select: { subscriptions: true } } },
    });

    const plansWithSubs = plans.filter(p => p._count.subscriptions > 0);
    if (plansWithSubs.length) {
      throw new BadRequestException('Cannot delete plans with active subscriptions');
    }

    await this.prisma.plan.deleteMany({ where: { id: { in: ids } } });
    return responseOk(`${ids.length} plan(s) deleted successfully`, null);
  }

  async createOrder(userId: string, planId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullname: true, status: true, expiresAt: true },
    });

    if (!user) throw new NotFoundException('User not found');

    let plan;
    if (planId) {
      plan = await this.prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) throw new NotFoundException('Plan not found');
    } else {
      plan = await this.prisma.plan.findUnique({ where: { name: 'PROPLUS' } });
    }

    // Check if user is trying to downgrade
    const currentSubscription = await this.prisma.subscription.findFirst({
      where: { userId, isCurrent: true },
      include: { plan: true },
    });

    if (currentSubscription?.plan) {
      const currentPlanPrice = currentSubscription.plan.price;
      const targetPlanPrice = plan.price;

      // Prevent downgrade (unless it's the same plan for renewal)
      if (targetPlanPrice < currentPlanPrice && currentSubscription.plan.id !== plan.id) {
        throw new BadRequestException(
          `Cannot downgrade from ${currentSubscription.plan.displayName} to ${plan.displayName}. Please upgrade to a higher tier plan.`
        );
      }
    }

    if (!plan || plan.price === 0) {
      if (plan && plan.price === 0) {
        const now = new Date();
        // Convert durationDays to milliseconds
        const durationMs = plan.durationDays * 24 * 60 * 60 * 1000;
        const endDate = new Date(now.getTime() + durationMs);

        await this.prisma.subscription.updateMany({
          where: { userId, isCurrent: true },
          data: { isCurrent: false },
        });

        await this.prisma.subscription.create({
          data: {
            userId,
            planId: plan.id,
            status: 'TRIAL',
            startDate: now,
            endDate,
            isCurrent: true,
          },
        });

        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'ACTIVE', expiresAt: endDate },
        });

        return responseOk('Free plan activated', { plan, endDate });
      }
      throw new NotFoundException('Plan not found');
    }

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: `${plan.displayName} Plan - ${plan.description} for ${user.fullname}`,
          amount: {
            currency_code: plan.currency,
            value: plan.price.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'NFC Tap Service',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: `${this.config.get('FRONTEND_URL')}/payment/success`,
        cancel_url: `${this.config.get('FRONTEND_URL')}/payment/cancel`,
      },
    });

    const order = await this.paypalConfig.getClient().execute(request);

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        planId: plan.id,
        amount: plan.price,
        currency: plan.currency,
        paypalOrderId: order.result.id,
        status: 'PENDING',
        durationDays: plan.durationDays,
        expiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
      },
    });

    return responseCreated('Order created successfully', {
      orderId: order.result.id,
      approveUrl: order.result.links.find((link: any) => link.rel === 'approve')?.href,
      payment,
    });
  }

  async captureOrder(orderId: string, payerId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { paypalOrderId: orderId },
      include: { user: true, plan: true },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status === 'COMPLETED') {
      return responseOk('Payment already completed', payment);
    }

    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await this.paypalConfig.getClient().execute(request);

    if (capture.result.status === 'COMPLETED') {
      const durationDays = payment.durationDays || payment.plan?.durationDays || 365;
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          paypalPayerId: payerId || capture.result.payer?.payer_id,
          expiresAt,
        },
      });

      await this.prisma.subscription.updateMany({
        where: { userId: payment.userId, isCurrent: true },
        data: { isCurrent: false },
      });

      const subscription = await this.prisma.subscription.create({
        data: {
          userId: payment.userId,
          planId: payment.planId,
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: expiresAt,
          isCurrent: true,
        },
        include: {
          plan: true,
        },
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id },
      });

      await this.prisma.user.update({
        where: { id: payment.userId },
        data: { status: 'ACTIVE', expiresAt },
      });

      return responseOk('Payment captured successfully', {
        paymentId: payment.id,
        amount: capture.result.purchase_units[0].payments.captures[0].amount.value,
        status: capture.result.status,
        expiresAt,
        subscription,
      });
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      throw new BadRequestException('Payment capture failed');
    }
  }

  async getUserPayments(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('Payments fetched successfully', payments);
  }

  async getAllPayments() {
    const payments = await this.prisma.payment.findMany({
      include: {
        user: { select: { id: true, email: true, fullname: true, avatarUrl: true } },
        plan: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('All payments fetched successfully', payments);
  }

  async getUserPaymentStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const currentSub = user.subscriptions.find(s => s.isCurrent);
    const isActive = user.status === 'ACTIVE' && user.expiresAt && new Date(user.expiresAt) > new Date();
    const daysRemaining = user.expiresAt
      ? Math.max(0, Math.ceil((new Date(user.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;

    const hasUsedFreeTrial = user.subscriptions.some(s => s.plan?.name === 'FREE');

    return responseOk('Payment status fetched successfully', {
      isActive,
      status: user.status,
      expiresAt: user.expiresAt,
      daysRemaining,
      currentSubscription: currentSub ? {
        plan: currentSub.plan,
        status: currentSub.status,
        endDate: currentSub.endDate,
      } : null,
      subscriptionHistory: user.subscriptions.map(s => ({
        plan: s.plan,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
        isCurrent: s.isCurrent,
      })),
      hasUsedFreeTrial,
      lastPayment: user.payments[0] || null,
    });
  }

  // Admin methods for subscription management

  async getAllSubscriptions() {
    const subscriptions = await this.prisma.subscription.findMany({
      include: {
        user: { select: { id: true, email: true, fullname: true, avatarUrl: true, status: true } },
        plan: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('All subscriptions fetched successfully', subscriptions);
  }

  async getFilteredSubscriptions(startDate?: string, endDate?: string) {
    const now = new Date();
    let dateFilter: any = {};

    if (startDate) {
      dateFilter.createdAt = { ...dateFilter.createdAt, gte: new Date(startDate) };
    }
    if (endDate) {
      dateFilter.createdAt = { ...dateFilter.createdAt, lte: new Date(endDate) };
    }

    const where = Object.keys(dateFilter).length > 0 ? dateFilter : {};

    const [subscriptions, totalCount, activeCount, expiredCount] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, fullname: true, avatarUrl: true, status: true } },
          plan: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.count({
        where: { ...where, status: 'ACTIVE', isCurrent: true },
      }),
      this.prisma.subscription.count({
        where: { ...where, status: 'EXPIRED' },
      }),
    ]);

    return responseOk('Filtered subscriptions fetched successfully', {
      subscriptions,
      counts: {
        total: totalCount,
        active: activeCount,
        expired: expiredCount,
      },
      startDate: startDate || null,
      endDate: endDate || null,
    });
  }

  async getUserSubscriptions(userId: string) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('User subscriptions fetched successfully', subscriptions);
  }

  async adminChangePlan(userId: string, planId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role?.name?.toUpperCase() === 'ADMIN') {
      throw new ForbiddenException('Cannot change plan for admin users');
    }

    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: { planPermissions: { include: { permission: true } } },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    const now = new Date();
    const endDate = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    await this.prisma.subscription.updateMany({
      where: { userId, isCurrent: true },
      data: { isCurrent: false },
    });

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: plan.price === 0 ? 'TRIAL' : 'ACTIVE',
        startDate: now,
        endDate,
        isCurrent: true,
      },
      include: { plan: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', expiresAt: endDate },
    });

    // Sync user's individual permissions with plan permissions
    const planPermissionIds = plan.planPermissions.map(pp => pp.permissionId);
    
    // Remove existing individual permissions
    await this.prisma.userPermission.deleteMany({ where: { userId } });
    
    // Add plan permissions as individual permissions
    if (planPermissionIds.length > 0) {
      await this.prisma.userPermission.createMany({
        data: planPermissionIds.map(permissionId => ({
          userId,
          permissionId,
          type: 'GRANT',
        })),
      });
    }

    return responseOk('Plan changed successfully', subscription);
  }

  async cancelSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const currentSub = user.subscriptions[0];

    if (!currentSub) {
      throw new NotFoundException('No active subscription found');
    }

    // Mark subscription as cancelled
    await this.prisma.subscription.update({
      where: { id: currentSub.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        isCurrent: false,
      },
    });

    // Don't change user status - keep them ACTIVE so they can login and upgrade
    // The SubscriptionGuard will handle blocking access to protected features

    return responseOk('Subscription cancelled successfully', { userId });
  }

  async cleanupExpiredSubscriptions() {
    const now = new Date();

    const expiredSubscriptions = await this.prisma.subscription.findMany({
      where: {
        isCurrent: true,
        endDate: { lt: now },
      },
      include: {
        user: {
          select: { id: true, fullname: true, email: true, status: true },
        },
      },
    });

    const cleanedUsers: { userId: string; fullname: string; email: string }[] = [];

    for (const sub of expiredSubscriptions) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'EXPIRED',
          isCurrent: false,
        },
      });

      await this.prisma.user.update({
        where: { id: sub.userId },
        data: {
          expiresAt: sub.endDate,
          status: 'INACTIVE',
        },
      });

      cleanedUsers.push({
        userId: sub.userId,
        fullname: sub.user.fullname,
        email: sub.user.email,
      });
    }

    return responseOk('Expired subscriptions cleaned up', {
      cleanedCount: cleanedUsers.length,
      cleanedUsers,
    });
  }

  async getPlanRoutes() {
    const routes: Array<{
      permission: string;
      method: string;
      path: string;
      description: string;
    }> = [];

    const httpMethodMap: Record<string, string> = {
      '0': 'GET',
      '1': 'POST',
      '2': 'PUT',
      '3': 'DELETE',
      '4': 'PATCH',
    };

    const controllers = this.discoveryService.getControllers();

    for (const wrapper of controllers) {
      const { instance, metatype } = wrapper;
      
      if (!instance || !metatype) continue;
      if (!Object.getPrototypeOf(instance)) continue;

      const controllerPath = this.reflector.get<string>(PATH_METADATA, metatype) || '';
      const prototype = Object.getPrototypeOf(instance);
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const handler = prototype[methodName];
        
        const routePath = this.reflector.get<string>(PATH_METADATA, handler);
        const routeMethod = this.reflector.get<string>(METHOD_METADATA, handler);

        if (routePath && routeMethod) {
          // Handle empty routePath, leading slashes, and ensure proper formatting
          const cleanRoutePath = routePath.startsWith('/') ? routePath.slice(1) : routePath;
          const normalizedRoutePath = cleanRoutePath === '' ? '' : `/${cleanRoutePath}`;
          const fullPath = controllerPath ? `/${controllerPath}${normalizedRoutePath}` : (cleanRoutePath === '' ? '/' : `/${cleanRoutePath}`);
          const method = httpMethodMap[routeMethod] || 'GET';
          
          // Now pass the actual HTTP method string to derivePermission
          const permission = derivePermission(metatype, method, fullPath);
          const description = `${method} ${fullPath}`;
          
          routes.push({
            permission,
            method,
            path: fullPath,
            description,
          });
        }
      }
    }

    const uniqueRoutes = routes.filter((route, index, self) =>
      index === self.findIndex(r => r.permission === route.permission && r.path === route.path)
    );

    // Get all unique permissions from routes
    const uniquePermissions = [...new Set(uniqueRoutes.map(r => r.permission))];

    // Ensure all permissions exist in database
    const existingPermissions = await this.prisma.permission.findMany({
      where: { name: { in: uniquePermissions } },
      select: { id: true, name: true },
    });

    const existingPermNames = new Set(existingPermissions.map(p => p.name));
    const missingPermissions = uniquePermissions.filter(p => !existingPermNames.has(p));

    // Create missing permissions
    if (missingPermissions.length > 0) {
      await this.prisma.permission.createMany({
        data: missingPermissions.map(name => ({ name })),
        skipDuplicates: true,
      });
    }

    // Fetch all permissions again (including newly created ones)
    const allPermissions = await this.prisma.permission.findMany({
      select: { id: true, name: true },
    });

    const permissionIdMap = new Map<string, string>();
    for (const perm of allPermissions) {
      permissionIdMap.set(perm.name, perm.id);
    }

    const plans = await this.prisma.plan.findMany({
      include: {
        planPermissions: {
          include: { permission: true },
        },
      },
      orderBy: { price: 'asc' },
    });

    const planPermissionMap = new Map<string, Set<string>>();
    for (const plan of plans) {
      const permSet = new Set(plan.planPermissions.map(pp => pp.permission.name));
      planPermissionMap.set(plan.id, permSet);
    }

    const result = uniqueRoutes.map(route => ({
      ...route,
      permissionId: permissionIdMap.get(route.permission) || null,
      plans: plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        displayName: plan.displayName,
        hasPermission: planPermissionMap.get(plan.id)?.has(route.permission) || false,
      })),
    }));

    return responseOk('Plan routes fetched successfully', {
      routes: result,
      plans: plans.map(p => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
      })),
    });
  }
}
