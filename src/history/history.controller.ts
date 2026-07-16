import { Controller, Get, Query } from '@nestjs/common';
import { HistoryService } from './history.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('history')
export class HistoryController {
  constructor(private historyService: HistoryService) {}

  /**
   * GET /history — Get all history records (all users).
   * Returns history entries ordered by timestamp descending.
   * Includes user info (id, fullname, email) for each entry.
   */
  @Get()
  findAll() {
    return this.historyService.findAll();
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
}
