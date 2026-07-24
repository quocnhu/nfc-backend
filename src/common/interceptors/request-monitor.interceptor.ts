import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '@/database/prisma/prisma.service';

@Injectable()
export class RequestMonitorInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(async (responseData) => {
        const response = context.switchToHttp().getResponse();
        const duration = Date.now() - startTime;

        const userId = request.user?.sub || null;
        const method = request.method;
        const path = request.route?.path || request.path;
        const statusCode = response.statusCode;
        const isProtected = !!request.user;
        const subscriptionStatus = request.subscriptionStatus || null;
        const planName = request.planName || null;
        const responseTime = duration;
        const ipAddress = request.ip || request.headers['x-forwarded-for'] || null;
        const userAgent = request.headers['user-agent'] || null;

        try {
          await this.prisma.requestLog.create({
            data: {
              userId,
              method,
              path,
              statusCode,
              isProtected,
              subscriptionStatus,
              planName,
              responseTime,
              ipAddress,
              userAgent,
            },
          });
        } catch (error) {
          console.error('Failed to log request:', error);
        }
      }),
    );
  }
}
