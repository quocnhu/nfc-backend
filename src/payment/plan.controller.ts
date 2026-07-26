import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentService } from '@/payment/payment.service';

@Controller('plans')
export class PlanController {
  constructor(private paymentService: PaymentService) {}

  @Get()
  getAllPlans() {
    return this.paymentService.getAllPlans();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createPlan(@Body() body: { name: string; displayName: string; description?: string; price: number; currency?: string; durationDays: number; isActive?: boolean; permissionIds?: string[] }) {
    return this.paymentService.createPlan(body);
  }

  @Post('update')
  @HttpCode(HttpStatus.OK)
  updatePlan(@Body() body: { id: string; name?: string; displayName?: string; description?: string; price?: number; currency?: string; durationDays?: number; isActive?: boolean; permissionIds?: string[] }) {
    return this.paymentService.updatePlan(body.id, body);
  }

  @Post('delete')
  @HttpCode(HttpStatus.OK)
  deletePlan(@Body() body: { id: string }) {
    return this.paymentService.deletePlan(body.id);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  bulkDeletePlans(@Body() body: { ids: string[] }) {
    return this.paymentService.bulkDeletePlans(body.ids);
  }
}
