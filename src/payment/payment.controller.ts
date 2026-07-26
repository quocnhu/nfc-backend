import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentService } from '@/payment/payment.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';

@Controller('payment')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Get('plans')
  @Public()
  getPlans() {
    return this.paymentService.getPlans();
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
  getPublicPaymentStatus(@Body() body: { userId: string }) {
    return this.paymentService.getUserPaymentStatus(body.userId);
  }
}
