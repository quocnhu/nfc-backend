import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { NotificationService } from '@/notification/notification.service';
import {
  DeleteNotificationDto,
  MarkReadDto,
  SendNotificationDto,
} from '@/notification/dto/notification.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PermissionHelper } from '@/common/helpers/permission.helper';

/**
 * NotificationController — user bell notifications and admin broadcast tools.
 *
 * User routes use /me so the global RolesGuard treats them as self-service.
 * Admin routes are listed in RolesGuard.isSelfServiceRoute and enforce the
 * ADMIN role here, so no extra permission rows are needed in the database.
 */
@Controller('notifications')
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    private permissionHelper: PermissionHelper,
  ) {}

  /**
   * GET /notifications/me — current user's notifications + unread count.
   */
  @Get('me')
  mine(@CurrentUser('sub') userId: string, @Query('limit') limit?: string) {
    return this.notificationService.mine(userId, limit ? parseInt(limit, 10) : 20);
  }

  /**
   * POST /notifications/me/read — mark selected (or all) notifications read.
   */
  @Post('me/read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser('sub') userId: string, @Body() dto: MarkReadDto) {
    return this.notificationService.markRead(userId, dto);
  }

  /**
   * GET /notifications/admin — list every sent notification (admin only).
   */
  @Get('admin')
  async listSent(@CurrentUser('sub') userId: string) {
    await this.assertAdmin(userId);
    return this.notificationService.listSent();
  }

  /**
   * POST /notifications/admin/send — send to all users or a role group.
   */
  @Post('admin/send')
  @HttpCode(HttpStatus.CREATED)
  async send(@CurrentUser('sub') userId: string, @Body() dto: SendNotificationDto) {
    await this.assertAdmin(userId);
    return this.notificationService.send(userId, dto);
  }

  /**
   * POST /notifications/admin/delete — delete a sent notification.
   */
  @Post('admin/delete')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser('sub') userId: string, @Body() dto: DeleteNotificationDto) {
    await this.assertAdmin(userId);
    return this.notificationService.remove(dto);
  }

  private async assertAdmin(userId: string) {
    if (!(await this.permissionHelper.isAdmin(userId))) {
      throw new ForbiddenException('Admin only');
    }
  }
}
