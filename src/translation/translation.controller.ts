import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/database/prisma/prisma.service';
import { TranslationService } from '@/translation/translation.service';
import { CreateTranslationDto, DeleteTranslationDto, BulkDeleteTranslationDto, SpeakQueryDto } from '@/translation/dto/create-translation.dto';

/**
 * TranslationController — Translate text via Google Translate and store history.
 *
 * POST   /api/translation                     — Translate + save
 * GET    /api/translation/me                  — List my translations
 * GET    /api/translation/tts                 — Native speech audio (text + lang)
 * GET    /api/translation                     — List translations (admin sees all)
 * DELETE /api/translation/:id                 — Delete one
 * POST   /api/translation/bulk-delete         — Delete many
 */
@Controller('translation')
export class TranslationController {
  constructor(
    private translationService: TranslationService,
    private prisma: PrismaService,
  ) {}

  /**
   * POST /translation — Translate text and save the pair for the user.
   * Body: { sourceText, sourceLang, targetLang }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateTranslationDto,
  ) {
    return this.translationService.translateAndStore(userId, dto);
  }

  /**
   * GET /translation/me — List the logged-in user's translations.
   */
  @Get('me')
  findMine(@CurrentUser('sub') userId: string) {
    return this.translationService.findMine(userId);
  }

  /**
   * GET /translation/tts?text=&lang= — Native-sounding speech (Google TTS proxy).
   * Returns { audio: base64-mp3 }.
   */
  @Get('tts')
  speak(@Query() dto: SpeakQueryDto) {
    return this.translationService.speak(dto);
  }

  /**
   * GET /translation — List translations.
   * Users only see their own; read:translation:all grants access to everyone's.
   */
  @Get()
  async findAll(@CurrentUser('sub') userId: string) {
    const hasReadAll = await this.hasPermission(userId, 'read:translation:all');
    return this.translationService.findAll(userId, hasReadAll);
  }

  /**
   * DELETE /translation/:id — Delete a translation.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    const canDeleteAll = await this.hasPermission(userId, 'delete:translation:all');
    return this.translationService.deleteOne(userId, id, canDeleteAll);
  }

  /**
   * POST /translation/bulk-delete — Delete multiple translations.
   * Body: { ids: string[] }
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  async bulkDelete(
    @CurrentUser('sub') userId: string,
    @Body() dto: BulkDeleteTranslationDto,
  ) {
    const canDeleteAll = await this.hasPermission(userId, 'delete:translation:all');
    return this.translationService.bulkDelete(userId, dto.ids, canDeleteAll);
  }

  /**
   * Check if a user has a specific permission (from role or individual).
   */
  private async hasPermission(userId: string, permissionName: string): Promise<boolean> {
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

    return new Set([...rolePerms, ...userPerms]).has(permissionName);
  }
}