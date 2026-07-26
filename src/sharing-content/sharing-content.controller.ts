import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Param,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SharingContentService } from '@/sharing-content/sharing-content.service';
import { CreateSharingContentDto } from '@/sharing-content/dto/create-sharing-content.dto';
import { UpdateSharingContentDto, DeleteSharingContentDto, GetSharingContentDto, BulkDeleteSharingContentDto } from '@/sharing-content/dto/update-sharing-content.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/database/prisma/prisma.service';

@Controller('sharing-content')
export class SharingContentController {
  constructor(
    private sharingContentService: SharingContentService,
    private prisma: PrismaService,
  ) {}

  // ─── Public routes (no authentication required) ───

  /**
   * GET /sharing-content/public/user?userId=xxx — Get a user's public profile and sharing content.
   * Used by NFC card tap: frontend reads userId from NFC, sends it here.
   * Returns user info (fullname, avatar) + all their sharing content items.
   * No auth required — anyone can view a public profile.
   */
  @Public()
  @Get('public/user')
  @HttpCode(HttpStatus.OK)
  findPublicByUser(@Query('userId') userId: string) {
    return this.sharingContentService.findPublicByUser(userId);
  }

  /**
   * GET /sharing-content/icon/:iconName — Proxy icon files from storage.
   * Prevents exposing Supabase URLs directly to the frontend.
   * Public endpoint so icons can be displayed on public profiles.
   */
  @Public()
  @Get('icon/:iconName')
  async getIcon(@Param('iconName') iconName: string, @Res() res: Response) {
    return this.sharingContentService.getIcon(iconName, res);
  }

  // ─── Self-service routes (any authenticated user) ───

  /**
   * POST /sharing-content — Create a new sharing content item.
   * Admin can assign to any user via targetUserId.
   * The userId is extracted from the JWT token.
   * Accepts: url, itemName, icon, targetUserId (optional, admin only).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSharingContentDto,
  ) {
    const hasReadAll = await this.checkUserPermission(userId, 'read:sharingcontent:all');
    return this.sharingContentService.create(userId, dto, hasReadAll);
  }

  /**
   * GET /sharing-content — List sharing content items.
   * Non-admin users (without read:sharingcontent:all) only see their own items.
   */
  @Get()
  async findAll(@CurrentUser('sub') userId: string) {
    const hasReadAll = await this.checkUserPermission(userId, 'read:sharingcontent:all');
    return this.sharingContentService.findAll(userId, hasReadAll);
  }

  /**
   * GET /sharing-content/me — Get the logged-in user's own sharing content.
   * Only returns items belonging to the authenticated user.
   */
  @Get('me')
  findMine(@CurrentUser('sub') userId: string) {
    return this.sharingContentService.findByUser(userId);
  }

  /**
   * POST /sharing-content/get — Get a single sharing content item by ID.
   * Accepts: { id } in request body (UUID validated by DTO).
   */
  @Post('get')
  @HttpCode(HttpStatus.OK)
  findOne(@Body() dto: GetSharingContentDto) {
    return this.sharingContentService.findOne(dto.id);
  }

  /**
   * POST /sharing-content/update — Update a sharing content item.
   * Admin (read:sharingcontent:all) can update any. Others can only update their own.
   */
  @Post('update')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateSharingContentDto,
  ) {
    const hasReadAll = await this.checkUserPermission(userId, 'read:sharingcontent:all');
    return this.sharingContentService.update(dto.id, userId, dto, hasReadAll);
  }

  /**
   * POST /sharing-content/delete — Delete a sharing content item.
   * Admin (read:sharingcontent:all) can delete any. Others can only delete their own.
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser('sub') userId: string, @Body() dto: DeleteSharingContentDto) {
    const hasReadAll = await this.checkUserPermission(userId, 'read:sharingcontent:all');
    return this.sharingContentService.remove(dto.id, userId, hasReadAll);
  }

  /**
   * POST /sharing-content/bulk-delete — Delete multiple sharing content items.
   * Admin (read:sharingcontent:all) can delete any. Others can only delete their own.
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  async bulkRemove(@CurrentUser('sub') userId: string, @Body() dto: BulkDeleteSharingContentDto) {
    const hasReadAll = await this.checkUserPermission(userId, 'read:sharingcontent:all');
    return this.sharingContentService.bulkDelete(dto.ids, userId, hasReadAll);
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
