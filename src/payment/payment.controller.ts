import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentService } from '@/payment/payment.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { SkipSubscription } from '@/common/decorators/skip-subscription.decorator';

@Controller('payment')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Get('plans')
  @Public()
  getPlans() {
    return this.paymentService.getPlans();
  }

  @Get('plans/all')
  getAllPlans() {
    return this.paymentService.getAllPlans();
  }

  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  createPlan(@Body() body: { name: string; displayName: string; description?: string; price: number; currency?: string; durationDays: number; isActive?: boolean; permissionIds?: string[] }) {
    return this.paymentService.createPlan(body);
  }

  @Post('plans/update')
  @HttpCode(HttpStatus.OK)
  updatePlan(@Body() body: { id: string; name?: string; displayName?: string; description?: string; price?: number; currency?: string; durationDays?: number; isActive?: boolean; permissionIds?: string[] }) {
    return this.paymentService.updatePlan(body.id, body);
  }

  @Post('plans/delete')
  @HttpCode(HttpStatus.OK)
  deletePlan(@Body() body: { id: string }) {
    return this.paymentService.deletePlan(body.id);
  }

  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  createOrder(@CurrentUser('sub') userId: string, @Body() body: { planId?: string }) {
    return this.paymentService.createOrder(userId, body.planId);
  }

  @Post('capture')
  @HttpCode(HttpStatus.OK)
  captureOrder(@Body() body: { orderId: string; payerId?: string }) {
    return this.paymentService.captureOrder(body.orderId, body.payerId);
  }

  @Get('my-payments')
  getUserPayments(@CurrentUser('sub') userId: string) {
    return this.paymentService.getUserPayments(userId);
  }

  @Get('all')
  getAllPayments() {
    return this.paymentService.getAllPayments();
  }

  @Get('status')
  getUserPaymentStatus(@CurrentUser('sub') userId: string) {
    return this.paymentService.getUserPaymentStatus(userId);
  }

  @Get('public-status')
  @Public()
  getPublicPaymentStatus(@Query('userId') userId: string) {
    return this.paymentService.getUserPaymentStatus(userId);
  }

  // Admin subscription management endpoints

  @Get('subscriptions')
  getAllSubscriptions(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    if (startDate || endDate) {
      return this.paymentService.getFilteredSubscriptions(startDate, endDate);
    }
    return this.paymentService.getAllSubscriptions();
  }

  @Get('subscriptions/user/:userId')
  getUserSubscriptions(@Query('userId') userId: string) {
    return this.paymentService.getUserSubscriptions(userId);
  }

  @Post('admin-change-plan')
  @HttpCode(HttpStatus.OK)
  adminChangePlan(@Body() body: { userId: string; planId: string }) {
    return this.paymentService.adminChangePlan(body.userId, body.planId);
  }

  @Post('cancel-subscription')
  @HttpCode(HttpStatus.OK)
  cancelSubscription(@Body() body: { userId: string }) {
    return this.paymentService.cancelSubscription(body.userId);
  }

  @Post('cleanup-expired')
  @HttpCode(HttpStatus.OK)
  cleanupExpiredSubscriptions() {
    return this.paymentService.cleanupExpiredSubscriptions();
  }
}
