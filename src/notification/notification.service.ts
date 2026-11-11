import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma/prisma.service';
import { MailService } from '@/mail/mail.service';
import { getNotificationEmailTemplate } from '@/notification/templates/notification-email.template';
import { responseCreated, responseOk } from '@/common/helpers/response.helper';
import {
  DeleteNotificationDto,
  MarkReadDto,
  SendNotificationDto,
} from '@/notification/dto/notification.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 3;
const EMAIL_BATCH_SIZE = 5;

type NotificationUser = {
  id: string;
  email: string;
  fullname: string;
};

type EmailRecipient = {
  id: string;
  user: { email: string; fullname: string };
};

/**
 * NotificationService — per-user bell notifications and admin broadcasts.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  /**
   * GET /notifications/me — latest notifications for the logged-in user plus
   * the unread count used by the header bell badge.
   */
  async mine(userId: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);

    const [rows, unreadCount] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          notification: {
            select: { id: true, title: true, body: true, createdAt: true },
          },
        },
      }),
      this.prisma.notificationRecipient.count({
        where: { userId, readAt: null },
      }),
    ]);

    return responseOk('Notifications fetched successfully', {
      items: rows.map((row) => ({
        id: row.id,
        notificationId: row.notificationId,
        title: row.notification.title,
        body: row.notification.body,
        createdAt: row.notification.createdAt,
        readAt: row.readAt,
      })),
      unreadCount,
    });
  }

  /**
   * POST /notifications/me/read — mark the given recipient rows as read, or
   * every unread notification when `all` is true.
   */
  async markRead(userId: string, dto: MarkReadDto) {
    if (!dto.all && (!dto.ids || dto.ids.length === 0)) {
      throw new BadRequestException('Provide ids or set all to true');
    }

    const result = await this.prisma.notificationRecipient.updateMany({
      where: {
        userId,
        readAt: null,
        ...(dto.all ? {} : { id: { in: dto.ids } }),
      },
      data: { readAt: new Date() },
    });

    return responseOk('Notifications marked as read', { updated: result.count });
  }

  /**
   * GET /notifications/admin — every sent notification with recipient, read,
   * and email counters for the admin table.
   */
  async listSent() {
    const [rows, readCounts, emailCounts] = await Promise.all([
      this.prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          role: { select: { id: true, name: true } },
          targetUser: { select: { id: true, fullname: true, email: true } },
          createdBy: { select: { id: true, fullname: true } },
          _count: { select: { recipients: true } },
        },
      }),
      this.prisma.notificationRecipient.groupBy({
        by: ['notificationId'],
        where: { readAt: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.notificationRecipient.groupBy({
        by: ['notificationId'],
        where: { emailSentAt: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const readMap = new Map(readCounts.map((row) => [row.notificationId, row._count._all]));
    const emailMap = new Map(emailCounts.map((row) => [row.notificationId, row._count._all]));

    return responseOk(
      'Notifications fetched successfully',
      rows.map((row) =>
        this.mapSent(row, readMap.get(row.id) ?? 0, emailMap.get(row.id) ?? 0),
      ),
    );
  }

  /**
   * POST /notifications/admin/send — create the message and one recipient row
   * per target user, then deliver emails in the background when requested.
   *
   * Each user can receive at most NOTIFICATION_DAILY_LIMIT (default 3) admin
   * messages per rolling 24 hours. Users over the cap are skipped.
   */
  async send(createdById: string, dto: SendNotificationDto) {
    let roleId: string | null = null;
    let targetUserId: string | null = null;
    let users: NotificationUser[] = [];

    if (dto.audienceType === 'ROLE') {
      if (!dto.roleId) {
        throw new BadRequestException('roleId is required when audienceType is ROLE');
      }

      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
        select: { id: true },
      });
      if (!role) throw new NotFoundException('Role not found');
      roleId = role.id;

      users = await this.prisma.user.findMany({
        where: { roleId },
        select: { id: true, email: true, fullname: true },
      });
    } else if (dto.audienceType === 'USER') {
      if (!dto.userId) {
        throw new BadRequestException('userId is required when audienceType is USER');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, email: true, fullname: true },
      });
      if (!user) throw new NotFoundException('User not found');
      targetUserId = user.id;
      users = [user];
    } else {
      users = await this.prisma.user.findMany({
        select: { id: true, email: true, fullname: true },
      });
    }

    const dailyLimit = this.getDailyLimit();
    const eligibleUsers = await this.filterDailyLimit(users, dailyLimit);
    const skippedCount = users.length - eligibleUsers.length;

    if (eligibleUsers.length === 0) {
      throw new BadRequestException(
        users.length === 0
          ? 'No users matched the selected audience'
          : `Every selected user has reached the daily limit of ${dailyLimit} messages. Try again later.`,
      );
    }

    const sendEmail = dto.sendEmail ?? true;

    const notification = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          title: dto.title,
          body: dto.body,
          audienceType: dto.audienceType,
          roleId,
          userId: targetUserId,
          sendEmail,
          skippedCount,
          createdById,
        },
      });

      await tx.notificationRecipient.createMany({
        data: eligibleUsers.map((user) => ({
          notificationId: created.id,
          userId: user.id,
        })),
      });

      return created;
    });

    const full = await this.prisma.notification.findUnique({
      where: { id: notification.id },
      include: {
        role: { select: { id: true, name: true } },
        targetUser: { select: { id: true, fullname: true, email: true } },
        createdBy: { select: { id: true, fullname: true } },
        _count: { select: { recipients: true } },
      },
    });

    if (!full) throw new NotFoundException('Notification not found');

    if (sendEmail) {
      const recipients = await this.prisma.notificationRecipient.findMany({
        where: { notificationId: notification.id },
        select: {
          id: true,
          user: { select: { email: true, fullname: true } },
        },
      });

      // Fire-and-forget so a large audience does not block the HTTP response.
      void this.sendEmails(full, recipients);
    }

    return responseCreated('Notification sent successfully', this.mapSent(full, 0, 0));
  }

  /**
   * POST /notifications/admin/delete — remove a sent notification. Recipients
   * are removed by the cascade relation.
   */
  async remove(dto: DeleteNotificationDto) {
    const existing = await this.prisma.notification.findUnique({
      where: { id: dto.id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Notification not found');

    await this.prisma.notification.delete({ where: { id: dto.id } });

    return responseOk('Notification deleted successfully');
  }

  private getDailyLimit(): number {
    const raw = Number(this.config.get('NOTIFICATION_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_DAILY_LIMIT;
  }

  private async filterDailyLimit(
    users: NotificationUser[],
    dailyLimit: number,
  ): Promise<NotificationUser[]> {
    if (users.length === 0 || dailyLimit <= 0) return users;

    const since = new Date(Date.now() - DAY_MS);
    const counts = await this.prisma.notificationRecipient.groupBy({
      by: ['userId'],
      where: {
        userId: { in: users.map((user) => user.id) },
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });

    const countMap = new Map(counts.map((row) => [row.userId, row._count._all]));

    return users.filter((user) => (countMap.get(user.id) ?? 0) < dailyLimit);
  }

  private async sendEmails(
    notification: { id: string; title: string; body: string },
    recipients: EmailRecipient[],
  ): Promise<void> {
    for (let index = 0; index < recipients.length; index += EMAIL_BATCH_SIZE) {
      const batch = recipients.slice(index, index + EMAIL_BATCH_SIZE);

      await Promise.all(
        batch.map(async (recipient) => {
          try {
            const html = getNotificationEmailTemplate(
              recipient.user.fullname,
              notification.title,
              notification.body,
            );

            await this.mail.send({
              to: recipient.user.email,
              subject: notification.title,
              html,
            });

            await this.prisma.notificationRecipient.update({
              where: { id: recipient.id },
              data: { emailSentAt: new Date(), emailError: null },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Failed to send notification email to ${recipient.user.email}: ${message}`,
            );

            await this.prisma.notificationRecipient
              .update({
                where: { id: recipient.id },
                data: { emailError: message.slice(0, 500) },
              })
              .catch(() => undefined);
          }
        }),
      );
    }
  }

  private mapSent(
    row: {
      id: string;
      title: string;
      body: string;
      audienceType: string;
      sendEmail: boolean;
      skippedCount: number;
      createdAt: Date;
      role: { id: string; name: string } | null;
      targetUser: { id: string; fullname: string; email: string } | null;
      createdBy: { id: string; fullname: string } | null;
      _count: { recipients: number };
    },
    readCount: number,
    emailCount: number,
  ) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      audienceType: row.audienceType,
      role: row.role,
      targetUser: row.targetUser,
      sendEmail: row.sendEmail,
      skippedCount: row.skippedCount,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      recipientCount: row._count.recipients,
      readCount,
      emailCount,
    };
  }
}
