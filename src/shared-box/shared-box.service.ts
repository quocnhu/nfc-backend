import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@/database/prisma/prisma.service';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';
import { TranslationService } from '@/translation/translation.service';

/**
 * SharedBoxService — learning boxes opened to anonymous visitors.
 *
 * A Learning Box is normally not stored at all: it is a view over the owner's
 * own Translation rows grouped by language pair. Sharing one therefore cannot
 * mean "expose those rows" — that would publish the owner's private history to
 * anyone who scans a QR.
 *
 * So a shared box is its own thing: it starts empty and keeps everything
 * written into it in SharedSentence. Two consequences worth stating plainly:
 *
 *   - Nothing the owner learned before sharing is exposed.
 *   - Revoking a link deletes nothing the owner owns, because nothing a guest
 *     wrote was ever part of the owner's history.
 *
 * Access is by unguessable token rather than by user id, so a token cannot be
 * guessed from another one's value and there is nothing to enumerate.
 */
@Injectable()
export class SharedBoxService {
  constructor(
    private prisma: PrismaService,
    private translation: TranslationService,
  ) {}

  /**
   * 20 random bytes, base64url — ~160 bits of entropy. A short or sequential
   * token would let someone walk the space and read strangers' boxes.
   */
  private newToken(): string {
    return randomBytes(20).toString('base64url');
  }

  /** Every box the caller owns, newest first. Requires auth. */
  async listMine(userId: string) {
    const boxes = await this.prisma.sharedBox.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { sentences: true } },
      },
    });
    return responseOk('Shared boxes fetched', boxes);
  }

  /**
   * Open a box for a language pair, or return the existing one.
   *
   * Idempotent per (owner, input, output): tapping Share twice must not litter
   * the owner with duplicate links for the same box.
   */
  async create(userId: string, inputLang: string, outputLang: string) {
    if (!inputLang || !outputLang) {
      throw new BadRequestException('Both languages are required');
    }
    if (inputLang === outputLang) {
      throw new BadRequestException('Source and output languages must be different');
    }

    const existing = await this.prisma.sharedBox.findFirst({
      where: { ownerId: userId, inputLang, outputLang },
      orderBy: { createdAt: 'desc' },
    });
    // A revoked box is revived rather than duplicated, so the QR already
    // printed keeps working.
    if (existing) {
      const revived = existing.isActive
        ? existing
        : await this.prisma.sharedBox.update({
            where: { id: existing.id },
            data: { isActive: true },
          });
      return responseCreated('Shared box ready', {
        id: revived.id,
        token: revived.token,
        inputLang: revived.inputLang,
        outputLang: revived.outputLang,
      });
    }

    const box = await this.prisma.sharedBox.create({
      data: { token: this.newToken(), ownerId: userId, inputLang, outputLang },
    });
    return responseCreated('Shared box created', {
      id: box.id,
      token: box.token,
      inputLang: box.inputLang,
      outputLang: box.outputLang,
    });
  }

  /** Revoke a link. Sentences stay on the box; the URL simply stops working. */
  async disable(userId: string, id: string) {
    const box = await this.prisma.sharedBox.findFirst({
      where: { id, ownerId: userId },
    });
    if (!box) throw new NotFoundException('Shared box not found');
    await this.prisma.sharedBox.update({
      where: { id },
      data: { isActive: false },
    });
    return responseOk('Share link revoked', { id });
  }

  /**
   * Public read. Anyone holding the token sees the box and its sentences —
   * but never the owner's identity, which is not part of the payload.
   */
  async readPublic(token: string) {
    const box = await this.prisma.sharedBox.findUnique({ where: { token } });
    if (!box || !box.isActive) {
      // Same response for "never existed" and "revoked", so the endpoint cannot
      // be used to probe which tokens are real.
      throw new NotFoundException('This shared box is not available');
    }
    const sentences = await this.prisma.sharedSentence.findMany({
      where: { boxId: box.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        sourceText: true,
        translatedText: true,
        romanization: true,
        isOwner: true,
        createdAt: true,
      },
    });

    return {
      inputLang: box.inputLang,
      outputLang: box.outputLang,
      sentences,
    };
  }

  /**
   * Public write — a visitor adds a sentence.
   *
   * The text is translated server-side into the box's output language, so a
   * guest cannot inject a pre-filled "translation" that never went through the
   * translator. Attributed with isOwner=false; the writer's IP is kept for
   * abuse investigation and never leaves the database.
   */
  async addSentence(
    token: string,
    sourceText: string,
    authorIp: string | null,
    isOwner: boolean,
    ownerId?: string,
  ) {
    const box = await this.prisma.sharedBox.findUnique({ where: { token } });
    if (!box || !box.isActive) {
      throw new NotFoundException('This shared box is not available');
    }

    // The owner's own writes must come from the account that owns the box —
    // otherwise any visitor could post rows flagged as the owner's.
    if (isOwner) {
      if (!ownerId || box.ownerId !== ownerId) {
        throw new ForbiddenException('Not your shared box');
      }
    }

    const text = sourceText.trim();
    if (!text) throw new BadRequestException('Text is required');
    if (text.length > 5000) throw new BadRequestException('Text is too long (max 5000 characters)');

    const { outputs, romanizations } = await this.translation.translateMany({
      text,
      fromHint: [box.inputLang],
      to: [box.outputLang],
    });

    const translatedText = outputs[box.outputLang];
    if (!translatedText) {
      throw new BadRequestException('Could not translate that sentence');
    }

    const sentence = await this.prisma.sharedSentence.create({
      data: {
        boxId: box.id,
        sourceText: text,
        translatedText,
        romanization: romanizations?.[box.outputLang] ?? null,
        isOwner,
        authorIp: authorIp ?? null,
      },
      select: {
        id: true,
        sourceText: true,
        translatedText: true,
        romanization: true,
        isOwner: true,
        createdAt: true,
      },
    });

    return sentence;
  }

  /** Confirm a token belongs to the caller — used to validate the owner's view. */
  async assertOwner(userId: string, token: string): Promise<string> {
    const box = await this.prisma.sharedBox.findUnique({ where: { token } });
    if (!box) throw new NotFoundException('Shared box not found');
    if (box.ownerId !== userId) throw new ForbiddenException('Not your shared box');
    return box.id;
  }
}
