import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { PaypalConfig } from './paypal.config';
import { ConfigService } from '@nestjs/config';
import * as paypal from '@paypal/checkout-server-sdk';
import { responseOk, responseCreated } from '../common/helpers/response.helper';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private paypalConfig: PaypalConfig,
    private config: ConfigService,
  ) {}

  /**
   * createOrder - Create a PayPal order for NFC service renewal
   */
  async createOrder(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullname: true, status: true, expiresAt: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const price = parseFloat(this.config.get('NFC_PRICE_USD') || '2.00');
    const durationDays = parseInt(this.config.get('NFC_DURATION_DAYS') || '365', 10);

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: `NFC Service - 1 Year Activation for ${user.fullname}`,
          amount: {
            currency_code: 'USD',
            value: price.toFixed(2),
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
        amount: price,
        currency: 'USD',
        paypalOrderId: order.result.id,
        status: 'PENDING',
        durationDays,
        expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
      },
    });

    return responseCreated('Order created successfully', {
      orderId: order.result.id,
      approveUrl: order.result.links.find((link: any) => link.rel === 'approve')?.href,
      payment,
    });
  }

  /**
   * captureOrder - Capture a PayPal payment and activate user
   */
  async captureOrder(orderId: string, payerId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { paypalOrderId: orderId },
      include: { user: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === 'COMPLETED') {
      return responseOk('Payment already completed', payment);
    }

    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await this.paypalConfig.getClient().execute(request);

    if (capture.result.status === 'COMPLETED') {
      const expiresAt = new Date(Date.now() + payment.durationDays * 24 * 60 * 60 * 1000);

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          paypalPayerId: payerId || capture.result.payer?.payer_id,
          expiresAt,
        },
      });

      await this.prisma.user.update({
        where: { id: payment.userId },
        data: {
          status: 'ACTIVE',
          expiresAt,
        },
      });

      return responseOk('Payment captured successfully', {
        paymentId: payment.id,
        amount: capture.result.purchase_units[0].payments.captures[0].amount.value,
        status: capture.result.status,
        expiresAt,
      });
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      throw new BadRequestException('Payment capture failed');
    }
  }

  /**
   * getUserPayments - Get all payments for a user
   */
  async getUserPayments(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('Payments fetched successfully', payments);
  }

  /**
   * getAllPayments - Get all payments (admin only)
   */
  async getAllPayments() {
    const payments = await this.prisma.payment.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullname: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('All payments fetched successfully', payments);
  }

  /**
   * getUserPaymentStatus - Get current payment status for a user
   */
  async getUserPaymentStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        payments: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isActive = user.status === 'ACTIVE' && user.expiresAt && new Date(user.expiresAt) > new Date();
    const daysRemaining = user.expiresAt
      ? Math.max(0, Math.ceil((new Date(user.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;

    return responseOk('Payment status fetched successfully', {
      isActive,
      status: user.status,
      expiresAt: user.expiresAt,
      daysRemaining,
      lastPayment: user.payments[0] || null,
    });
  }
}
