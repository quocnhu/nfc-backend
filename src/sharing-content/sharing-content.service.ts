import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateSharingContentDto } from './dto/create-sharing-content.dto';
import { UpdateSharingContentDto } from './dto/update-sharing-content.dto';
import { responseOk, responseCreated } from '../common/helpers/response.helper';

@Injectable()
export class SharingContentService {
  constructor(private prisma: PrismaService) {}

  /**
   * create — Create a new sharing content item for the authenticated user.
   * 1. Insert a new SharingContent record with userId, url, itemName, icon.
   * 2. Return the created record.
   */
  async create(userId: string, dto: CreateSharingContentDto) {
    const content = await this.prisma.sharingContent.create({
      data: {
        userId,
        url: dto.url,
        itemName: dto.itemName,
        icon: dto.icon,
      },
    });

    return responseCreated('Sharing content created successfully', content);
  }

  /**
   * findAll — Get all sharing content items across all users.
   * Includes user info (id, fullname, email) for each item.
   * Ordered by creation date descending (newest first).
   */
  async findAll() {
    const contents = await this.prisma.sharingContent.findMany({
      include: { user: { select: { id: true, fullname: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('Sharing contents fetched successfully', contents);
  }

  /**
   * findByUser — Get all sharing content items for a specific user.
   * Used for the "My Content" view — only returns the user's own items.
   */
  async findByUser(userId: string) {
    const contents = await this.prisma.sharingContent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('Your sharing contents fetched successfully', contents);
  }

  /**
   * findOne — Get a single sharing content item by its ID.
   * Includes user info (id, fullname, email) of the content owner.
   * Throws 404 if the item doesn't exist.
   */
  async findOne(id: string) {
    const content = await this.prisma.sharingContent.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullname: true, email: true } } },
    });
    if (!content) throw new NotFoundException('Sharing content not found');
    return responseOk('Sharing content fetched successfully', content);
  }

  /**
   * findPublicByUser — Get a user's public profile + all their sharing content.
   * Used by the NFC card tap flow: frontend sends userId, backend returns
   * the user's name, avatar, and all their sharing content items.
   * Throws 404 if user not found.
   */
  async findPublicByUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullname: true,
        email: true,
        avatarUrl: true,
        sharingContent: {
          select: {
            id: true,
            url: true,
            itemName: true,
            icon: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return responseOk('Public profile fetched successfully', user);
  }

  /**
   * update — Update a sharing content item.
   * 1. Find the item → 404 if not found.
   * 2. Check ownership → 403 if not the creator.
   * 3. Update the record with the provided fields.
   */
  async update(id: string, userId: string, dto: UpdateSharingContentDto) {
    // Step 1: Find the content item
    const content = await this.prisma.sharingContent.findUnique({ where: { id } });
    if (!content) throw new NotFoundException('Sharing content not found');

    // Step 2: Verify the user owns this content
    if (content.userId !== userId) throw new ForbiddenException('Not your content');

    // Step 3: Update the record
    const updated = await this.prisma.sharingContent.update({
      where: { id },
      data: dto,
    });

    return responseOk('Sharing content updated successfully', updated);
  }

  /**
   * remove — Delete a sharing content item.
   * 1. Find the item → 404 if not found.
   * 2. Check ownership → 403 if not the creator.
   * 3. Delete the record (cascades via onDelete in schema).
   */
  async remove(id: string, userId: string) {
    // Step 1: Find the content item
    const content = await this.prisma.sharingContent.findUnique({ where: { id } });
    if (!content) throw new NotFoundException('Sharing content not found');

    // Step 2: Verify the user owns this content
    if (content.userId !== userId) throw new ForbiddenException('Not your content');

    // Step 3: Delete the record
    await this.prisma.sharingContent.delete({ where: { id } });

    return responseOk('Sharing content deleted successfully');
  }
}
