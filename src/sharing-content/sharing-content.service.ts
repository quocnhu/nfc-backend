import { Injectable, NotFoundException, ForbiddenException, StreamableFile } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { SupabaseConfig } from '@/config/supabase.config';
import { ConfigService } from '@nestjs/config';
import { CreateSharingContentDto } from '@/sharing-content/dto/create-sharing-content.dto';
import { UpdateSharingContentDto } from '@/sharing-content/dto/update-sharing-content.dto';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';
import { Response } from 'express';

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

  async create(userId: string, dto: CreateSharingContentDto, hasReadAll: boolean = false) {
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

  async findByUser(userId: string) {
    const contents = await this.prisma.sharingContent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return responseOk('Your sharing contents fetched successfully', contents);
  }

  async findOne(id: string) {
    const content = await this.prisma.sharingContent.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullname: true, email: true } } },
    });
    if (!content) throw new NotFoundException('Sharing content not found');
    return responseOk('Sharing content fetched successfully', content);
  }

  async getIcon(iconName: string, res: Response) {
    const adminUser = await this.prisma.user.findFirst({
      where: { role: { name: 'ADMIN' } },
      select: { id: true },
    });

    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    const adminFolder = await this.getUserFolder(adminUser.id);
    const iconPath = `userdata/${adminFolder}/icon`;

    const possibleExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
    let filePath = '';

    for (const ext of possibleExtensions) {
      const testPath = `${iconPath}/${iconName}${ext}`;
      const { data } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(iconPath, { search: `${iconName}${ext}` });

      if (data && data.some(file => file.name === `${iconName}${ext}`)) {
        filePath = testPath;
        break;
      }
    }

    if (!filePath) {
      throw new NotFoundException('Icon not found');
    }

    const { data, error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .download(filePath);

    if (error || !data) {
      throw new NotFoundException('Icon not found');
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', svg: 'image/svg+xml',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  }

  async findPublicByUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullname: true,
        email: true,
        avatarUrl: true,
        status: true,
        expiresAt: true,
        role: { select: { id: true, name: true } },
        subscriptions: {
          where: { isCurrent: true },
          take: 1,
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
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
    if (user.role?.name?.toUpperCase() === 'ADMIN') throw new NotFoundException('User not found');

    // VIP and COMPANY users bypass subscription checks
    const isVipOrCompany = user.role?.name?.toUpperCase() === 'VIP' || 
                            user.role?.name?.toUpperCase() === 'COMPANY';

    const currentSub = user.subscriptions[0];
    const isExpired = user.expiresAt && new Date(user.expiresAt) < new Date();
    const isSubExpired = currentSub && new Date(currentSub.endDate) < new Date();

    // Only check expiration for non-VIP/COMPANY users
    if (!isVipOrCompany && (user.status === 'INACTIVE' || user.status === 'BLOCKED' || isExpired || isSubExpired)) {
      throw new ForbiddenException('NFC_EXPIRED');
    }

    try {
      await this.prisma.history.create({
        data: {
          userId,
          action: 'read:publicview',
          entityType: 'publicview',
          entityId: userId,
          details: `Public profile viewed`,
        },
      });
    } catch {}

    // Get admin user to find icon folder (icons are stored in admin's folder)
    let adminIconFolder = '';
    try {
      const adminUser = await this.prisma.user.findFirst({
        where: { role: { name: 'ADMIN' } },
        select: { id: true },
      });
      if (adminUser) {
        const adminFolder = await this.getUserFolder(adminUser.id);
        adminIconFolder = `userdata/${adminFolder}/icon`;
      }
    } catch {
      adminIconFolder = '';
    }

    let iconFiles: string[] = [];
    if (adminIconFolder) {
      const { data } = await this.supabase.storage.from(BUCKET_NAME).list(adminIconFolder);
      if (data) {
        iconFiles = data.map(file => file.name);
      }
    }

    const sharingContentWithIcons = user.sharingContent.map((item) => {
      let iconUrl = '';
      if (iconFiles.length > 0 && item.icon) {
        const matchedFile = iconFiles.find(f => f.startsWith(`${item.icon}.`));
        if (matchedFile) {
          const filePath = `${adminIconFolder}/${matchedFile}`;
          iconUrl = this.getPublicUrl(filePath);
        }
      }
      return { ...item, iconUrl };
    });

    const result = {
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      subscription: currentSub ? {
        plan: currentSub.plan,
        status: currentSub.status,
        endDate: currentSub.endDate,
      } : null,
      sharingContent: sharingContentWithIcons,
    };

    return responseOk('Public profile fetched successfully', result);
  }

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

  async remove(id: string, userId: string, hasReadAll: boolean = false) {
    const content = await this.prisma.sharingContent.findUnique({ where: { id } });
    if (!content) throw new NotFoundException('Sharing content not found');

    if (!hasReadAll && content.userId !== userId) throw new ForbiddenException('Not your content');

    await this.prisma.sharingContent.delete({ where: { id } });

    return responseOk('Sharing content deleted successfully');
  }

  async bulkDelete(ids: string[], userId: string, hasReadAll: boolean = false) {
    if (!ids.length) throw new NotFoundException('No IDs provided');

    const contents = await this.prisma.sharingContent.findMany({ where: { id: { in: ids } } });

    if (!hasReadAll) {
      const forbidden = contents.filter(c => c.userId !== userId);
      if (forbidden.length) throw new ForbiddenException('Not your content');
    }

    await this.prisma.sharingContent.deleteMany({ where: { id: { in: ids } } });

    return responseOk(`${ids.length} sharing content(s) deleted successfully`);
  }
}
