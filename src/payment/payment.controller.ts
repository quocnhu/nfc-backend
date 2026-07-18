import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('payment')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  /**
   * POST /payment/create-order - Create a PayPal order
   */
  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  createOrder(@CurrentUser('sub') userId: string) {
    return this.paymentService.createOrder(userId);
  }

  /**
   * POST /payment/capture - Capture a PayPal payment
   */
  @Post('capture')
  @HttpCode(HttpStatus.OK)
  captureOrder(@Body() body: { orderId: string; payerId?: string }) {
    return this.paymentService.captureOrder(body.orderId, body.payerId);
  }

  /**
   * GET /payment/my-payments - Get current user's payments
   */
  @Get('my-payments')
  getUserPayments(@CurrentUser('sub') userId: string) {
    return this.paymentService.getUserPayments(userId);
  }

  /**
   * GET /payment/all - Get all payments (admin only)
   */
  @Get('all')
  getAllPayments() {
    return this.paymentService.getAllPayments();
  }

  /**
   * GET /payment/status - Get current user's payment status
   */
  @Get('status')
  getUserPaymentStatus(@CurrentUser('sub') userId: string) {
    return this.paymentService.getUserPaymentStatus(userId);
  }

  /**
   * GET /payment/public-status/:userId - Get public payment status for NFC page
   */
  @Get('public-status/:userId')
  @Public()
  getPublicPaymentStatus(@Query('userId') userId: string) {
    return this.paymentService.getUserPaymentStatus(userId);
  }
}
