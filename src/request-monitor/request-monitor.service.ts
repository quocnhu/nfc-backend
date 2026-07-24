import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { responseOk } from '@/common/helpers/response.helper';

@Injectable()
export class RequestMonitorService {
  constructor(private prisma: PrismaService) {}

  async getRequestCounts() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [today, thisWeek, thisMonth, thisYear, total] = await Promise.all([
      this.prisma.requestLog.count({
        where: { timestamp: { gte: startOfDay } },
      }),
      this.prisma.requestLog.count({
        where: { timestamp: { gte: startOfWeek } },
      }),
      this.prisma.requestLog.count({
        where: { timestamp: { gte: startOfMonth } },
      }),
      this.prisma.requestLog.count({
        where: { timestamp: { gte: startOfYear } },
      }),
      this.prisma.requestLog.count(),
    ]);

    return responseOk('Request counts fetched successfully', {
      today,
      thisWeek,
      thisMonth,
      thisYear,
      total,
    });
  }

  async getProtectedRouteStats() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [today, thisWeek, thisMonth, thisYear, total] = await Promise.all([
      this.prisma.requestLog.count({
        where: { isProtected: true, timestamp: { gte: startOfDay } },
      }),
      this.prisma.requestLog.count({
        where: { isProtected: true, timestamp: { gte: startOfWeek } },
      }),
      this.prisma.requestLog.count({
        where: { isProtected: true, timestamp: { gte: startOfMonth } },
      }),
      this.prisma.requestLog.count({
        where: { isProtected: true, timestamp: { gte: startOfYear } },
      }),
      this.prisma.requestLog.count({
        where: { isProtected: true },
      }),
    ]);

    return responseOk('Protected route stats fetched successfully', {
      today,
      thisWeek,
      thisMonth,
      thisYear,
      total,
    });
  }

  async getTopRoutes(limit: number = 10) {
    const routes = await this.prisma.requestLog.groupBy({
      by: ['path', 'method'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    return responseOk('Top routes fetched successfully', routes);
  }

  async getTopProtectedRoutes(limit: number = 10) {
    const routes = await this.prisma.requestLog.groupBy({
      by: ['path', 'method'],
      where: { isProtected: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    return responseOk('Top protected routes fetched successfully', routes);
  }

  async getPlanUsage() {
    const planUsage = await this.prisma.requestLog.groupBy({
      by: ['planName'],
      where: { planName: { not: null, notIn: ['PUBLIC', 'SKIPPED', 'ADMIN'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return responseOk('Plan usage fetched successfully', planUsage);
  }

  async getSubscriptionStatusBreakdown() {
    const statusBreakdown = await this.prisma.requestLog.groupBy({
      by: ['subscriptionStatus'],
      where: { subscriptionStatus: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return responseOk('Subscription status breakdown fetched successfully', statusBreakdown);
  }

  async getAverageResponseTime() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, thisMonth, allTime] = await Promise.all([
      this.prisma.requestLog.aggregate({
        where: { timestamp: { gte: startOfDay }, responseTime: { not: null } },
        _avg: { responseTime: true },
        _count: { id: true },
      }),
      this.prisma.requestLog.aggregate({
        where: { timestamp: { gte: startOfMonth }, responseTime: { not: null } },
        _avg: { responseTime: true },
        _count: { id: true },
      }),
      this.prisma.requestLog.aggregate({
        where: { responseTime: { not: null } },
        _avg: { responseTime: true },
        _count: { id: true },
      }),
    ]);

    return responseOk('Average response time fetched successfully', {
      today: {
        avg: Math.round(today._avg.responseTime || 0),
        count: today._count.id,
      },
      thisMonth: {
        avg: Math.round(thisMonth._avg.responseTime || 0),
        count: thisMonth._count.id,
      },
      allTime: {
        avg: Math.round(allTime._avg.responseTime || 0),
        count: allTime._count.id,
      },
    });
  }
}
