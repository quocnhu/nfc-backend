import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { SupabaseConfig } from '../config/supabase.config';
import { ConfigService } from '@nestjs/config';
import { CreateSharingContentDto } from './dto/create-sharing-content.dto';
import { UpdateSharingContentDto } from './dto/update-sharing-content.dto';
import { responseOk, responseCreated } from '../common/helpers/response.helper';

const BUCKET_NAME = 'foldersupabase';

@Injectable()
export class SharingContentService {
  constructor(
    private prisma: PrismaService,
    private supabaseConfig: SupabaseConfig,
    private config: ConfigService,
  ) {}

  private get supabase() {
    return this.supabaseConfig.getClient();
  }

  private getPublicUrl(filePath: string): string {
    const { data: urlData } = this.supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);
    return urlData.publicUrl;
  }

  private async getUserFolder(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullname: true, role: { select: { name: true } } },
    });
    if (!user?.fullname) {
      throw new NotFoundException('User not found');
    }
    const sanitized = user.fullname
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const role = user.role?.name?.toLowerCase() || 'user';
    return `${sanitized}_${userId}_${role}`;
  }

  /**
   * create — Create a new sharing content item.
   * Admin can assign to any user via targetUserId.
   * Non-admin can only create for themselves.
   */
  async create(userId: string, dto: CreateSharingContentDto, hasReadAll: boolean = false) {
    // Admin can assign to a target user, non-admin always uses their own userId
    const assignToUser = hasReadAll && dto.targetUserId ? dto.targetUserId : userId;

    const content = await this.prisma.sharingContent.create({
      data: {
        userId: assignToUser,
        url: dto.url,
        itemName: dto.itemName,
        icon: dto.icon,
        createdBy: userId,
      },
      include: {
        user: { select: { id: true, fullname: true, email: true } },
        creator: { select: { id: true, fullname: true, email: true } },
      },
    });

    return responseCreated('Sharing content created successfully', content);
  }

  /**
   * findAll — Get sharing content items.
   * If hasReadAll is false, returns only the current user's items.
   */
  async findAll(currentUserId?: string, hasReadAll: boolean = false) {
    const where = !hasReadAll && currentUserId
      ? { userId: currentUserId }
      : {};

    const contents = await this.prisma.sharingContent.findMany({
      where,
      include: {
        user: { select: { id: true, fullname: true, email: true } },
        creator: { select: { id: true, fullname: true, email: true } },
      },
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
   * the user's name, avatar, and all their sharing content items with icon URLs.
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
        role: { select: { id: true, name: true } },
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
    if (user.role?.name === 'ADMIN') throw new NotFoundException('User not found');

    // Get admin user to find icon folder path
    const adminUser = await this.prisma.user.findFirst({
      where: { role: { name: 'ADMIN' } },
      select: { id: true },
    });

    let adminIconFolder = '';
    if (adminUser) {
      try {
        const adminFolder = await this.getUserFolder(adminUser.id);
        adminIconFolder = `userdata/${adminFolder}/icon`;
      } catch {
        adminIconFolder = '';
      }
    }

    // Build sharing content with icon URLs
    const sharingContentWithIcons = user.sharingContent.map((item) => {
      let iconUrl = '';
      if (adminIconFolder && item.icon) {
        // Try to find the icon file in admin's icon folder
        const possibleExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        for (const ext of possibleExtensions) {
          const iconPath = `${adminIconFolder}/${item.icon}${ext}`;
          iconUrl = this.getPublicUrl(iconPath);
          break; // Use first match (jpg is most common after processing)
        }
      }
      return {
        ...item,
        iconUrl,
      };
    });

    const result = {
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      sharingContent: sharingContentWithIcons,
    };

    return responseOk('Public profile fetched successfully', result);
  }

  /**
   * update — Update a sharing content item.
   * Admin (hasReadAll) can update any item. Others can only update their own.
   */
  async update(id: string, userId: string, dto: UpdateSharingContentDto, hasReadAll: boolean = false) {
    const content = await this.prisma.sharingContent.findUnique({ where: { id } });
    if (!content) throw new NotFoundException('Sharing content not found');

    if (!hasReadAll && content.userId !== userId) throw new ForbiddenException('Not your content');

    const updated = await this.prisma.sharingContent.update({
      where: { id },
      data: dto,
    });

    return responseOk('Sharing content updated successfully', updated);
  }

  /**
   * remove — Delete a sharing content item.
   * Admin (hasReadAll) can delete any item. Others can only delete their own.
   */
  async remove(id: string, userId: string, hasReadAll: boolean = false) {
    const content = await this.prisma.sharingContent.findUnique({ where: { id } });
    if (!content) throw new NotFoundException('Sharing content not found');

    if (!hasReadAll && content.userId !== userId) throw new ForbiddenException('Not your content');

    await this.prisma.sharingContent.delete({ where: { id } });

    return responseOk('Sharing content deleted successfully');
  }
}
