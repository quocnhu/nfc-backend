import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PaymentController } from '@/payment/payment.controller';
import { PlanController } from '@/payment/plan.controller';
import { SubscriptionController } from '@/payment/subscription.controller';
import { PaymentService } from '@/payment/payment.service';
import { PaypalConfig } from '@/payment/paypal.config';
import { PrismaModule } from '@/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule, DiscoveryModule],
  controllers: [PaymentController, PlanController, SubscriptionController],
  providers: [PaymentService, PaypalConfig],
  exports: [PaymentService],
})
export class PaymentModule {}
