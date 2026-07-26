import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentService } from '@/payment/payment.service';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private paymentService: PaymentService) {}

  @Get()
  getAllSubscriptions(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    if (startDate || endDate) {
      return this.paymentService.getFilteredSubscriptions(startDate, endDate);
    }
    return this.paymentService.getAllSubscriptions();
  }

  @Get('user/:userId')
  getUserSubscriptions(@Query('userId') userId: string) {
    return this.paymentService.getUserSubscriptions(userId);
  }

  @Post('admin-change-plan')
  @HttpCode(HttpStatus.OK)
  adminChangePlan(@Body() body: { userId: string; planId: string }) {
    return this.paymentService.adminChangePlan(body.userId, body.planId);
  }

  @Post('cancel')
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
