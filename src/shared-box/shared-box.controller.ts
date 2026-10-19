import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { SharedBoxService } from '@/shared-box/shared-box.service';
import { LiveRateLimiter } from '@/translation/live-rate-limiter';
import { LiveBoxGateway } from '@/shared-box/shared-box.gateway';
import { ipFromRequest } from '@/common/utils/client-ip';
import { CreateSharedBoxDto, AddSharedSentenceDto } from '@/shared-box/dto/shared-box.dto';

@Controller('shared-boxes')
export class SharedBoxController {
  constructor(
    private readonly boxes: SharedBoxService,
    private readonly limiter: LiveRateLimiter,
    private readonly gateway: LiveBoxGateway,
  ) {}

  /** GET /shared-boxes — boxes I own. Auth required. */
  @Get()
  listMine(@CurrentUser('sub') userId: string) {
    return this.boxes.listMine(userId);
  }

  /** POST /shared-boxes — open a box for a language pair. Auth required. */
  @Post()
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateSharedBoxDto) {
    return this.boxes.create(userId, dto.inputLang, dto.outputLang);
  }

  /** DELETE /shared-boxes/:id — revoke a share link. Auth required. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  disable(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.boxes.disable(userId, id);
  }

  /**
   * GET /shared-boxes/public/:token — read a box. Public by design: the token
   * in the URL *is* the capability.
   */
  @Public()
  @Get('public/:token')
  async readPublic(@Param('token') token: string) {
    const box = await this.boxes.readPublic(token);
    return { statusCode: 200, message: 'Shared box fetched', data: box };
  }

  /**
   * POST /shared-boxes/public/:token/sentences — add a sentence. Public.
   *
   * Rate limited per IP because this endpoint costs real translation CPU and is
   * reachable by anyone who has scanned the QR.
   */
  @Public()
  @Post('public/:token/sentences')
  @HttpCode(HttpStatus.CREATED)
  async addSentence(
    @Param('token') token: string,
    @Body() dto: AddSharedSentenceDto,
    @CurrentUser('sub') userId: string | undefined,
    @Req() req: Request,
  ) {
    const ip = ipFromRequest(req);
    const quota = this.limiter.consumeTurn(ip);
    if (!quota.allowed) {
      const seconds = Math.ceil(quota.retryAfterMs / 1000);
      throw new BadRequestException(`Too many sentences. Try again in ${seconds}s.`);
    }

    // An authenticated caller may write as the owner; everyone else is a guest.
    // The service re-checks ownership against the box, so this flag cannot be
    // used to impersonate the owner.
    let asOwner = false;
    if (userId) {
      try {
        await this.boxes.assertOwner(userId, token);
        asOwner = true;
      } catch {
        asOwner = false;
      }
    }
    const sentence = await this.boxes.addSentence(token, dto.sourceText, ip, asOwner, userId);

    // Push to everyone currently looking at the box, owner included.
    this.gateway.broadcastSentence(token, sentence);
    return { statusCode: 201, message: 'Sentence added', data: sentence };
  }
}
