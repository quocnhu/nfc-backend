import { Controller, Get, Query } from '@nestjs/common';
import { HistoryService } from './history.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../database/prisma/prisma.service';

@Controller('history')
export class HistoryController {
  constructor(
    private historyService: HistoryService,
    private prisma: PrismaService,
  ) {}

  /**
   * GET /history — Get history records.
   * Non-admin users (without read:history:all) only see their own records.
   */
  @Get()
  async findAll(@CurrentUser('sub') userId: string) {
    const hasReadAll = await this.checkUserPermission(userId, 'read:history:all');
    return this.historyService.findAll(userId, hasReadAll);
  }

  /**
   * GET /history/me — Get the logged-in user's own history.
   * Only returns history entries belonging to the authenticated user.
   */
  @Get('me')
  findMine(@CurrentUser('sub') userId: string) {
    return this.historyService.findByUser(userId);
  }

  /**
   * GET /history/recent — Get the most recent history entries.
   * Query param: ?limit=20 (default: 20).
   * Returns the latest entries across all users.
   */
  @Get('recent')
  findRecent(@Query('limit') limit?: string) {
    return this.historyService.findRecent(limit ? parseInt(limit, 10) : 20);
  }

  /**
   * Check if a user has a specific permission (from role or individual).
   */
  private async checkUserPermission(userId: string, permissionName: string): Promise<boolean> {
    const userData = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        userPermissions: { include: { permission: true } },
      },
    });

    if (!userData) return false;

    const rolePerms = userData.role.permissions.map((p) => p.name);
    const userPerms = userData.userPermissions.map((up) => up.permission.name);
    const allPermissions = new Set([...rolePerms, ...userPerms]);

    return allPermissions.has(permissionName);
  }
}
