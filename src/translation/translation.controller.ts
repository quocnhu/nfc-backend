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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/database/prisma/prisma.service';
import { TranslationService } from '@/translation/translation.service';
import {
  CreateTranslationDto,
  UpdateTranslationDto,
  DeleteTranslationDto,
  BulkDeleteTranslationDto,
  SpeakQueryDto,
  LiveTranslateDto,
  RomanizeDto,
  SttDto,
} from '@/translation/dto/create-translation.dto';

/**
 * TranslationController — Translate text via Google Translate and store history.
 *
 * POST   /api/translation                     — Translate + save
 * POST   /api/translation/update              — Edit a saved translation
 * GET    /api/translation/me                  — List my translations
 * GET    /api/translation/tts                 — Native speech audio (text + lang)
 * GET    /api/translation                     — List translations (admin sees all)
 * DELETE /api/translation/:id                 — Delete one
 * POST   /api/translation/bulk-delete         — Delete many
 * POST   /api/translation/live                — Realtime turn (Gemini, not saved)
 * POST   /api/translation/stt                 — Realtime speech-to-text (multipart `audio`)
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
   * POST /translation/update — Edit a saved translation.
   * Body: { id, sourceText?, translatedText? }
   */
  @Post('update')
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateTranslationDto,
  ) {
    const canEditAll = await this.hasPermission(userId, 'delete:translation:all');
    return this.translationService.update(userId, dto, canEditAll);
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
   * POST /translation/live — Realtime turn via Gemini.
   * Body: { text, fromHint?, to[] } → { outputs: { lang: text }, errors: { lang: msg } }
   *
   * Deliberately does not persist: realtime turns are ephemeral.
   */
  @Post('live')
  @HttpCode(HttpStatus.OK)
  async live(@Body() dto: LiveTranslateDto) {
    const { outputs, errors, romanizations, detectedSource } = await this.translationService.translateLive({
      text: dto.text,
      fromHint: dto.fromHint,
      to: dto.to,
    });
    return {
      statusCode: 200,
      message: 'Live translation ready',
      data: { outputs, errors, romanizations, detectedSource },
    };
  }

  /**
   * POST /translation/romanize — Pronunciation guide for one text.
   * Body: { text, lang } → { romanization } (null when the language needs none).
   *
   * Lets the UI fill in a guide on demand — for a saved translation that was
   * stored before romanization existed, or to retry one that came back empty.
   */
  @Post('romanize')
  @HttpCode(HttpStatus.OK)
  async romanize(@Body() dto: RomanizeDto) {
    const romanization = await this.translationService.romanize(dto.text, dto.lang);
    return {
      statusCode: 200,
      message: romanization ? 'Romanization ready' : 'No romanization for this language',
      data: { romanization, lang: dto.lang },
    };
  }

  /**
   * POST /translation/stt — Speech-to-text for the realtime mic.
   * Multipart: `audio` file + optional `langHint` field.
   */
  @Post('stt')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio'))
  async stt(
    @UploadedFile() audio: Express.Multer.File | undefined,
    @Body() body?: SttDto,
  ) {
    if (!audio) {
      return { statusCode: 400, message: 'Audio file is required', data: null };
    }
    const result = await this.translationService.stt(audio.buffer, audio.mimetype, body?.langHint);
    return { statusCode: 200, message: 'Speech transcribed', data: result };
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