import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { responseOk } from '@/common/helpers/response.helper';

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * log — Record a new history entry.
   * Called by the HistoryInterceptor after each non-GET request.
   * Stores: userId, action (e.g. "create:sharingcontent"), entityId, entityType, details.
   */
  async log(userId: string, action: string, entityId?: string, entityType?: string, details?: string, ipAddress?: string, userAgent?: string) {
    return this.prisma.history.create({
      data: { userId, action, entityId, entityType, details, ipAddress, userAgent },
    });
  }

  /**
   * findAll — Get history records.
   * If hasReadAll is false, returns only the current user's records.
   */
  async findAll(currentUserId?: string, hasReadAll: boolean = false) {
    const where = !hasReadAll && currentUserId
      ? { userId: currentUserId }
      : {};

    const histories = await this.prisma.history.findMany({
      where,
      include: { user: { select: { id: true, fullname: true, email: true } } },
      orderBy: { timestamp: 'desc' },
    });

    return responseOk('History fetched successfully', histories);
  }

  /**
   * findByUser — Get history records for a specific user.
   * Only returns entries belonging to the given userId.
   * Ordered by timestamp descending.
   */
  async findByUser(userId: string) {
    const histories = await this.prisma.history.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });

    return responseOk('User history fetched successfully', histories);
  }

  /**
   * findRecent — Get the most recent history entries (across all users).
   * @param limit — Maximum number of entries to return (default: 20).
   * Includes user info for each entry.
   */
  async findRecent(limit: number = 20) {
    const histories = await this.prisma.history.findMany({
      include: { user: { select: { id: true, fullname: true, email: true } } },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return responseOk('Recent history fetched successfully', histories);
  }
}
