import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SharingContentService } from './sharing-content.service';
import { CreateSharingContentDto } from './dto/create-sharing-content.dto';
import { UpdateSharingContentDto, DeleteSharingContentDto, GetSharingContentDto } from './dto/update-sharing-content.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('sharing-content')
export class SharingContentController {
  constructor(private sharingContentService: SharingContentService) {}

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

  // ─── Self-service routes (any authenticated user) ───

  /**
   * POST /sharing-content — Create a new sharing content item.
   * The userId is extracted from the JWT token.
   * Accepts: url, itemName, icon.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSharingContentDto,
  ) {
    return this.sharingContentService.create(userId, dto);
  }

  /**
   * GET /sharing-content — List all sharing content items (with user info).
   * Returns all items from all users, ordered by creation date descending.
   */
  @Get()
  findAll() {
    return this.sharingContentService.findAll();
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
   * Ownership check: only the creator can update their own content.
   * Accepts: id (required), url, itemName, icon (all optional).
   */
  @Post('update')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateSharingContentDto,
  ) {
    return this.sharingContentService.update(dto.id, userId, dto);
  }

  /**
   * POST /sharing-content/delete — Delete a sharing content item.
   * Ownership check: only the creator can delete their own content.
   * Accepts: { id } in request body.
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser('sub') userId: string, @Body() dto: DeleteSharingContentDto) {
    return this.sharingContentService.remove(dto.id, userId);
  }
}
