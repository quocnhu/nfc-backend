import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { PrismaModule } from '@/database/prisma/prisma.module';
import { SupabaseModule } from '@/config/supabase.module';
import { AuthModule } from '@/auth/auth.module';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { SharingContentModule } from '@/sharing-content/sharing-content.module';
import { HistoryModule } from '@/history/history.module';
import { DashboardModule } from '@/dashboard/dashboard.module';
import { UploadModule } from '@/upload/upload.module';
import { UserModule } from '@/user/user.module';
import { RoleModule } from '@/role/role.module';
import { PermissionModule } from '@/permission/permission.module';
import { QRModule } from '@/qr/qr.module';
import { PaymentModule } from '@/payment/payment.module';
import { RequestMonitorModule } from '@/request-monitor/request-monitor.module';
import { PermissionHelperModule } from '@/common/helpers/permission-helper.module';
import { HistoryInterceptor } from '@/common/interceptors/history.interceptor';
import { RequestMonitorInterceptor } from '@/common/interceptors/request-monitor.interceptor';
import { PermissionSyncService } from '@/common/services/permission-sync.service';

/**
 * AppModule — Root module of the application.
 *
 * Global providers (registered via APP_GUARD / APP_INTERCEPTOR):
 *   1. JwtAuthGuard — Runs on EVERY request. Skips if @Public().
 *      Validates the JWT from the httpOnly cookie.
 *   2. RolesGuard — Runs after JwtAuthGuard. Skips if @Public() or /me route.
 *      Auto-derives permission from controller name + route, checks against DB.
 *   3. SubscriptionGuard — Runs after RolesGuard. Checks user's subscription
 *      and plan permissions dynamically. Skips for @Public() routes without userId.
 *   4. HistoryInterceptor — Runs after every successful non-GET request.
 *      Logs the action to the History table for audit trail.
 *   5. RequestMonitorInterceptor — Runs on ALL requests.
 *      Logs request metrics (method, path, status, response time, subscription info).
 *
 * Execution order per request:
 *   JwtAuthGuard → RolesGuard → SubscriptionGuard → Controller → HistoryInterceptor → RequestMonitorInterceptor → Response
 */
@Module({
  imports: [
    // Load .env and make ConfigService available globally
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DiscoveryModule,    // Required for PermissionSyncService
    PrismaModule,       // Database connection (Prisma ORM)
    SupabaseModule,    // Supabase storage client
    PermissionHelperModule, // Permission checking helper (global)
    AuthModule,         // Authentication (signup, signin, logout, JWT, password reset)
    SharingContentModule, // Sharing content CRUD + public NFC endpoint
    HistoryModule,      // Audit trail logging and retrieval
    DashboardModule,    // Dashboard stats, permissions breakdown, recent activity
    UploadModule,       // Avatar upload/download/delete via Supabase Storage
    UserModule,         // User CRUD, self-service profile, permission assignment
    RoleModule,         // Role CRUD with permission assignment
    PermissionModule,   // Permission CRUD
    QRModule,           // QR code generation
    PaymentModule,      // PayPal payment processing
    RequestMonitorModule, // Request monitoring and analytics
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PermissionSyncService,
    // Global guard: JWT authentication on all routes (skips @Public)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global guard: Permission checking on all routes (skips @Public and /me)
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global guard: Subscription checking on all routes (checks plan permissions)
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    // Global interceptor: Logs history for all write operations
    {
      provide: APP_INTERCEPTOR,
      useClass: HistoryInterceptor,
    },
    // Global interceptor: Monitors all requests for analytics
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestMonitorInterceptor,
    },
  ],
})
export class AppModule {}
