import { Module } from '@nestjs/common';
import { PaymentController } from '@/payment/payment.controller';
import { PaymentService } from '@/payment/payment.service';
import { PaypalConfig } from '@/payment/paypal.config';
import { PrismaModule } from '@/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController],
  providers: [PaymentService, PaypalConfig],
  exports: [PaymentService],
})
export class PaymentModule {}
