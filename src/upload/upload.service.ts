import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { SupabaseConfig } from '../config/supabase.config';
import { responseOk, responseCreated } from '../common/helpers/response.helper';
import { Readable } from 'stream';

// sharp 0.35+ ships ESM types only; use require for CJS compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp') as (input: Buffer | Uint8Array) => {
  resize: (w: number, h: number, opts?: any) => any;
  jpeg: (opts?: any) => any;
  toBuffer: () => Promise<Buffer>;
};

/** ALLOWED_MIMES — Only accept standard image formats (jpeg, png). */
const ALLOWED_MIMES = ['image/jpeg', 'image/png'];

/** MAX_FILES — Global limit: max 10 files per upload batch (admin). */
const MAX_FILES = 10;

/** USERDATA_STORAGE_LIMIT — Max total storage per regular user (20MB). */
const USERDATA_STORAGE_LIMIT = 20 * 1024 * 1024;

/** USERDATA_MAX_SIZE — Max file size for regular user uploads (10MB). */
const USERDATA_MAX_SIZE = 10 * 1024 * 1024;

/** ADMIN_MAX_SIZE — Max file size for admin uploads (1GB). */
const ADMIN_MAX_SIZE = 1024 * 1024 * 1024;

/** ICON_MAX_SIZE — Max file size for icon uploads (2MB). */
const ICON_MAX_SIZE = 2 * 1024 * 1024;

/** USERDATA_MAX_DIMENSION — Max width/height for userdata images (512px). */
const USERDATA_MAX_DIMENSION = 512;

/** ICON_MAX_DIMENSION — Max width/height for icon images (256px). */
const ICON_MAX_DIMENSION = 256;

/** BUCKET_NAME — Single Supabase Storage bucket for all uploads. */
const BUCKET_NAME = 'foldersupabase';

/** BUILT_IN_FOLDERS — System folders that exist by default. */
const BUILT_IN_FOLDERS: Record<string, { displayName: string; description: string; maxSize: number; maxDim: number }> = {
  userdata: { displayName: 'User Data', description: 'Personal files.', maxSize: ICON_MAX_SIZE, maxDim: USERDATA_MAX_DIMENSION },
  icon: { displayName: 'Icon (NFC Item Icons)', description: 'For sharing content items. Max 2MB, 256x256px.', maxSize: ICON_MAX_SIZE, maxDim: ICON_MAX_DIMENSION },
};

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
  folder: string;
}

@Injectable()
export class UploadService {
  private get supabase() {
    return this.supabaseConfig.getClient();
  }

  constructor(
    private prisma: PrismaService,
    private supabaseConfig: SupabaseConfig,
  ) {}

  /** Get max size and dimension for a folder. */
  private getFolderConfig(folderName: string) {
    if (BUILT_IN_FOLDERS[folderName]) {
      return BUILT_IN_FOLDERS[folderName];
    }
    return { displayName: folderName, description: '', maxSize: ICON_MAX_SIZE, maxDim: USERDATA_MAX_DIMENSION };
  }

  /** Check if user is admin. */
  private async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    return user?.role?.name === 'ADMIN';
  }

  /** Validate filename — no path traversal. */
  private validateFilename(filename: string): void {
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename');
    }
  }

  /** Validate folder name — alphanumeric, underscore, dash only. */
  private validateFolderName(folder: string): void {
    if (!folder || !/^[a-zA-Z0-9_-]+$/.test(folder)) {
      throw new BadRequestException('Invalid folder name. Only letters, numbers, underscore, dash allowed.');
    }
  }

  /** Process image with sharp — resize and convert to JPEG. */
  private async processImage(buffer: Buffer, maxDim: number): Promise<Buffer> {
    return sharp(buffer)
      .resize(maxDim, maxDim, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 90, progressive: true })
      .toBuffer();
  }

  /** Get public URL for a file in the storage bucket. */
  private getPublicUrl(filePath: string): string {
    const { data: urlData } = this.supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);
    return urlData.publicUrl;
  }

  /** Get a proxy URL that routes through the backend. */
  private getProxyUrl(filePath: string): string {
    return `/upload/userdata/file?path=${encodeURIComponent(filePath)}`;
  }

  /** Validate that a file path belongs to the user. */
  private validateUserFileAccess(userId: string, filePath: string): void {
    if (filePath.includes('..') || filePath.includes('\\')) {
      throw new BadRequestException('Invalid file path');
    }
    // Only allow accessing files under userdata/ bucket
    if (!filePath.startsWith('userdata/')) {
      throw new ForbiddenException('Access denied');
    }
  }

  /**
   * streamFile — Download a file from Supabase and return stream + metadata.
   * Used by the proxy endpoint.
   */
  async streamFile(userId: string, filePath: string): Promise<{ stream: Readable; contentType: string; filename: string }> {
    this.validateUserFileAccess(userId, filePath);

    // Extract user folder from path and verify ownership
    // Path format: userdata/{fullname}_{userId}_{role}/...
    const pathParts = filePath.split('/');
    if (pathParts.length < 3) {
      throw new BadRequestException('Invalid file path');
    }
    const userFolder = pathParts[1];
    // Folder format: {fullname}_{userId}_{role}
    // Verify the userId segment matches exactly
    const folderSegments = userFolder.split('_');
    // userId is the second-to-last segment
    const folderUserId = folderSegments.length >= 3 ? folderSegments[folderSegments.length - 2] : null;
    if (!folderUserId || folderUserId !== userId) {
      throw new ForbiddenException('Access denied: not your file');
    }

    const { data, error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .download(filePath);

    if (error || !data) {
      throw new NotFoundException('File not found');
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const stream = Readable.from(buffer);

    // Determine content type from file extension
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      pdf: 'application/pdf', txt: 'text/plain',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const filename = filePath.split('/').pop() || 'file';

    return { stream, contentType, filename };
  }

  /**
   * getUserFolder — Resolve userId to a drive folder name: {fullname}_{userId}_{role}
   */
  private async getUserFolder(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullname: true, role: { select: { name: true } } },
    });
    if (!user?.fullname) {
      throw new BadRequestException('User not found');
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
   * ensureUserdataFolders — On first visit, create the avatar system folder.
   * For admins, also create the icon system folder.
   * Subsequent visits: no-op if folders already exist.
   */
  private async ensureUserdataFolders(userId: string) {
    const userIsAdmin = await this.isAdmin(userId);
    const userFolder = await this.getUserFolder(userId);
    const avatarPath = `userdata/${userFolder}/avatar`;

    const { data } = await this.supabase.storage
      .from(BUCKET_NAME)
      .list(avatarPath, { limit: 1 });

    if (!data || data.length === 0) {
      await this.supabase.storage
        .from(BUCKET_NAME)
        .upload(`${avatarPath}/.keep`, new Uint8Array(0), {
          contentType: 'application/octet-stream',
          upsert: true,
        });
    }

    // Admin also gets an icon system folder inside userdata
    if (userIsAdmin) {
      const iconPath = `userdata/${userFolder}/icon`;
      const { data: iconData } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(iconPath, { limit: 1 });

      if (!iconData || iconData.length === 0) {
        const { error: iconErr } = await this.supabase.storage
          .from(BUCKET_NAME)
          .upload(`${iconPath}/.keep`, new Uint8Array(0), {
            contentType: 'application/octet-stream',
            upsert: true,
          });
        if (iconErr) {
          console.error('[ensureUserdataFolders] icon create failed:', iconErr.message);
        }
      }
    }
  }

  /** getUserStorageUsage — Calculate total bytes used by a user in userdata/{userFolder}/ */
  private async getUserStorageUsage(userId: string): Promise<number> {
    const userFolder = await this.getUserFolder(userId);
    let totalBytes = 0;
    try {
      const { data: rootData } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(`userdata/${userFolder}`, { limit: 200 });
      if (rootData) {
        for (const item of rootData) {
          if (item.id !== null && item.name !== '.keep' && item.name !== 'avatar') {
            totalBytes += item.metadata?.size || 0;
          }
        }
      }
      const { data: avatarData } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(`userdata/${userFolder}/avatar`, { limit: 100 });
      if (avatarData) {
        for (const item of avatarData) {
          if (item.id !== null && item.name !== '.keep') {
            totalBytes += item.metadata?.size || 0;
          }
        }
      }
    } catch {
      // Best effort
    }
    return totalBytes;
  }

  /** checkStorageLimit — Enforce 20MB limit for non-admin users. */
  private async checkStorageLimit(userId: string, additionalBytes: number): Promise<void> {
    const userIsAdmin = await this.isAdmin(userId);
    if (userIsAdmin) return;

    const used = await this.getUserStorageUsage(userId);
    if (used + additionalBytes > USERDATA_STORAGE_LIMIT) {
      const remainingMB = ((USERDATA_STORAGE_LIMIT - used) / 1024 / 1024).toFixed(1);
      throw new BadRequestException(
        `Storage limit reached. You have ${remainingMB}MB remaining of ${USERDATA_STORAGE_LIMIT / 1024 / 1024}MB.`,
      );
    }
  }

  async getUserStorageUsageSummary(userId: string) {
    const userIsAdmin = await this.isAdmin(userId);
    if (userIsAdmin) {
      return responseOk('Storage usage fetched', {
        usedBytes: 0,
        limitBytes: 0,
        usedMB: '0',
        limitMB: '0',
        percent: 0,
        fileCount: 0,
        isAdmin: true,
      });
    }
    const usedBytes = await this.getUserStorageUsage(userId);
    const limitBytes = USERDATA_STORAGE_LIMIT;
    const usedMB = (usedBytes / 1024 / 1024).toFixed(2);
    const limitMB = (limitBytes / 1024 / 1024).toFixed(0);
    const percent = Math.min(Math.round((usedBytes / limitBytes) * 100), 100);
    return responseOk('Storage usage fetched', {
      usedBytes,
      limitBytes,
      usedMB,
      limitMB,
      percent,
      isAdmin: false,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // USERDATA — User's personal folder
  // ═══════════════════════════════════════════════════════════════

  /**
   * uploadUserdataAvatar — Upload user's avatar to userdata/{userId}/avatar/
   * - Keeps old avatars (does NOT delete)
   * - Updates User.avatarUrl in DB to the new one
   */
  async uploadUserdataAvatar(userId: string, file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    // Ensure folder structure exists (creates avatar folder on first visit)
    await this.ensureUserdataFolders(userId);

    // Check storage capacity (admin unlimited, regular user 20MB)
    await this.checkStorageLimit(userId, file.buffer.length);

    const userFolder = await this.getUserFolder(userId);

    // Resize avatar to 512x512, keep original format
    const ext = file.originalname.split('.').pop() || 'jpg';
    const processedBuffer = await sharp(file.buffer)
      .resize(USERDATA_MAX_DIMENSION, USERDATA_MAX_DIMENSION, { fit: 'cover', position: 'center' })
      .toBuffer();

    // Upload to userdata/{userName}/avatar/avatar_{timestamp}.{ext}
    const timestamp = Date.now();
    const filePath = `userdata/${userFolder}/avatar/avatar_${timestamp}.${ext}`;

    const { error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, processedBuffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }

    const url = this.getPublicUrl(filePath);

    // Update User.avatarUrl in DB
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    return responseCreated('Avatar uploaded successfully', { avatarUrl: url, path: filePath });
  }

  /**
   * listUserdataAvatars — List all avatar files for a user.
   */
  async listUserdataAvatars(userId: string) {
    try {
      const userFolder = await this.getUserFolder(userId);
      const { data } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(`userdata/${userFolder}/avatar`, { limit: 100 });

      if (!data) return responseOk('Avatars listed successfully', []);

      const avatars = data
        .filter((item) => item.id !== null)
        .map((item) => {
          const filePath = `userdata/${userFolder}/avatar/${item.name}`;
          return {
            name: item.name,
            url: this.getPublicUrl(filePath),
            path: filePath,
            size: item.metadata?.size || 0,
            created_at: item.created_at || '',
          };
        });

      // Sort newest first
      avatars.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return responseOk('Avatars listed successfully', avatars);
    } catch {
      return responseOk('Avatars listed successfully', []);
    }
  }

  /**
   * selectUserdataAvatar — Set an existing avatar file as the active avatar.
   */
  async selectUserdataAvatar(userId: string, filename: string) {
    this.validateFilename(filename);

    const userFolder = await this.getUserFolder(userId);

    const { data } = await this.supabase.storage
      .from(BUCKET_NAME)
      .list(`userdata/${userFolder}/avatar`, { limit: 100 });

    const match = data?.find((f) => f.name === filename && f.id !== null);
    if (!match) {
      throw new NotFoundException('Avatar file not found');
    }

    const filePath = `userdata/${userFolder}/avatar/${filename}`;
    const url = this.getPublicUrl(filePath);

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    return responseOk('Avatar selected successfully', { avatarUrl: url });
  }

  /**
   * deleteUserdataAvatar — Remove user's avatar from Supabase Storage.
   */
  private async deleteUserdataAvatar(userId: string) {
    try {
      const userFolder = await this.getUserFolder(userId);
      const { data } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(`userdata/${userFolder}/avatar`, { limit: 100 });

      if (data && data.length > 0) {
        const filePaths = data
          .filter((f) => f.id !== null)
          .map((f) => `userdata/${userFolder}/avatar/${f.name}`);

        if (filePaths.length > 0) {
          await this.supabase.storage.from(BUCKET_NAME).remove(filePaths);
        }
      }
    } catch {
      // Best effort
    }
  }

  /**
   * uploadUserdataFiles — Upload files to userdata/{userId}/
   * - 20MB total storage limit for non-admin users
   */
  async uploadUserdataFiles(
    userId: string,
    files: Express.Multer.File[],
    subPath?: string,
  ): Promise<{ uploaded: UploadResult[]; errors: string[] }> {
    const validFiles = files.filter((f) => f != null);
    if (validFiles.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    // Check total storage limit for non-admin
    const totalNewBytes = validFiles.reduce((sum, f) => sum + f.size, 0);
    await this.checkStorageLimit(userId, totalNewBytes);

    const userIsAdmin = await this.isAdmin(userId);

    // Ensure folder structure exists
    await this.ensureUserdataFolders(userId);

    const userFolder = await this.getUserFolder(userId);
    const cleanSubPath = subPath && !subPath.includes('..') && !subPath.includes('\\') ? subPath.replace(/^\/|\/$/g, '') : '';
    const basePath = cleanSubPath ? `userdata/${userFolder}/${cleanSubPath}` : `userdata/${userFolder}`;
    const results: UploadResult[] = [];
    const errors: string[] = [];

    for (const file of validFiles) {
      if (!file || !file.buffer) {
        errors.push(`"${file?.originalname || 'unknown'}": invalid file data`);
        continue;
      }

      const maxSize = userIsAdmin ? ADMIN_MAX_SIZE : USERDATA_MAX_SIZE;
      if (file.size > maxSize) {
        const maxMB = userIsAdmin ? '1GB' : '10MB';
        errors.push(`"${file.originalname}": too large (max ${maxMB})`);
        continue;
      }

      try {
        // Store original file as-is (no processing)
        const ext = file.originalname.split('.').pop() || 'bin';
        const timestamp = Date.now();
        const baseName = file.originalname
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        const filePath = `${basePath}/${baseName}_${timestamp}.${ext}`;

        const { error } = await this.supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (error) {
          errors.push(`"${file.originalname}": storage error — ${error.message}`);
          continue;
        }

        const url = this.getProxyUrl(filePath);

        results.push({
          url,
          filename: file.originalname,
          size: file.buffer.length,
          folder: `userdata/${userFolder}`,
        });
      } catch (err: any) {
        errors.push(`"${file.originalname}": processing error — ${err.message}`);
      }
    }

    if (results.length === 0 && errors.length > 0) {
      throw new BadRequestException(`All uploads failed: ${errors.join('; ')}`);
    }

    return { uploaded: results, errors };
  }

  /**
   * listUserdataFiles — List all files in userdata/{userId}/
   * - Avatar (from avatar/ subfolder)
   * - Photos (from userdata/{userId}/ root)
   */
  async listUserdataFiles(userId: string) {
    const files: any[] = [];
    const userFolder = await this.getUserFolder(userId);

    // 1. List avatar files
    try {
      const { data: avatarData } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(`userdata/${userFolder}/avatar`, { limit: 100 });

      if (avatarData) {
        for (const item of avatarData) {
          if (item.id === null) continue;
          const filePath = `userdata/${userFolder}/avatar/${item.name}`;
          files.push({
            name: item.name,
            url: this.getPublicUrl(filePath),
            size: item.metadata?.size || 0,
            created_at: item.created_at || '',
            mimetype: item.metadata?.mimetype || 'image/jpeg',
            type: 'avatar',
            path: filePath,
          });
        }
      }
    } catch {
      // Best effort
    }

    // 2. List photo files (root of userdata/{userName}/)
    try {
      const { data: photoData } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(`userdata/${userFolder}`, {
          limit: 200,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (photoData) {
        for (const item of photoData) {
          if (item.id === null || item.name === 'avatar') continue;
          const filePath = `userdata/${userFolder}/${item.name}`;
          files.push({
            name: item.name,
            url: this.getProxyUrl(filePath),
            size: item.metadata?.size || 0,
            created_at: item.created_at || '',
            mimetype: item.metadata?.mimetype || 'image/jpeg',
            type: 'photo',
            path: filePath,
          });
        }
      }
    } catch {
      // Best effort
    }

    // Sort by created_at desc
    files.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return responseOk('Files listed successfully', files);
  }

  /**
   * browseUserdata — Browse contents of a folder within userdata/{userId}/
   * path "" → root, "avatar" → avatar subfolder, etc.
   * Returns items with type "folder" or "file".
   */
  async browseUserdata(userId: string, path: string) {
    // Sanitize path — no traversal
    if (path.includes('..') || path.includes('\\')) {
      throw new BadRequestException('Invalid path');
    }

    const userFolder = await this.getUserFolder(userId);
    const fullPath = path ? `userdata/${userFolder}/${path}` : `userdata/${userFolder}`;

    // Ensure folder structure exists on first visit
    await this.ensureUserdataFolders(userId);

    const items: any[] = [];

    try {
      const { data, error } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(fullPath, {
          limit: 200,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error || !data) {
        // Folder might not exist yet — return empty
        return responseOk('Folder contents listed', { currentPath: path, items: [] });
      }

      for (const item of data) {
        if (item.name === '.keep') continue;
        if (item.id === null) {
          items.push({
            name: item.name,
            type: 'folder' as const,
            path: path ? `${path}/${item.name}` : item.name,
            size: 0,
            created_at: item.created_at || '',
          });
        } else {
          const filePath = `${fullPath}/${item.name}`;
          const isAvatar = fullPath.endsWith('/avatar');
          items.push({
            name: item.name,
            type: 'file' as const,
            url: this.getProxyUrl(filePath),
            size: item.metadata?.size || 0,
            created_at: item.created_at || '',
            mimetype: item.metadata?.mimetype || 'application/octet-stream',
            path: filePath,
            isAvatar,
          });
        }
      }
    } catch {
      // Folder doesn't exist yet — return empty
    }

    return responseOk('Folder contents listed', {
      currentPath: path,
      items,
    });
  }

  /**
   * createUserdataFolder — Create a subfolder inside userdata/{userId}/{path}/
   * by uploading a .keep placeholder file.
   */
  async createUserdataFolder(userId: string, folderName: string, currentPath?: string) {
    const sanitized = folderName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!sanitized || sanitized.length < 1) {
      throw new BadRequestException('Invalid folder name');
    }
    if (sanitized === 'avatar' || sanitized === 'icon' || sanitized === '.keep') {
      throw new BadRequestException('This folder name is reserved');
    }
    if (sanitized.includes('..') || sanitized.includes('/') || sanitized.includes('\\')) {
      throw new BadRequestException('Invalid folder name');
    }

    // Prevent creating folders inside the avatar folder (except for admins)
    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin && currentPath && currentPath.startsWith('avatar')) {
      throw new BadRequestException('Cannot create folders inside the avatar folder');
    }

    const userFolder = await this.getUserFolder(userId);
    const basePath = currentPath
      ? `userdata/${userFolder}/${currentPath}`
      : `userdata/${userFolder}`;
    const folderPath = `${basePath}/${sanitized}`;

    // Check if already exists
    const { data: existing } = await this.supabase.storage
      .from(BUCKET_NAME)
      .list(folderPath, { limit: 5 });
    if (existing && existing.length > 0) {
      throw new BadRequestException('Folder already exists');
    }

    // Upload .keep placeholder
    const { error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .upload(`${folderPath}/.keep`, new Uint8Array(0), {
        contentType: 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Failed to create folder: ${error.message}`);
    }

    return responseOk('Folder created successfully', {
      name: sanitized,
      path: currentPath ? `${currentPath}/${sanitized}` : sanitized,
    });
  }

  /**
   * deleteUserdataFolder — Delete a subfolder and all its contents.
   */
  async deleteUserdataFolder(userId: string, folderPath: string) {
    if (!folderPath || folderPath.includes('..') || folderPath.includes('\\')) {
      throw new BadRequestException('Invalid folder path');
    }
    if (folderPath === 'avatar' || folderPath === 'icon') {
      throw new BadRequestException('Cannot delete the system folder');
    }

    const userFolder = await this.getUserFolder(userId);
    const fullPath = `userdata/${userFolder}/${folderPath}`;

    // List all items in the folder
    const { data } = await this.supabase.storage
      .from(BUCKET_NAME)
      .list(fullPath, { limit: 200 });

    if (!data || data.length === 0) {
      throw new NotFoundException('Folder not found');
    }

    const filePaths = data.map((f) => `${fullPath}/${f.name}`);
    const { error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .remove(filePaths);

    if (error) {
      throw new BadRequestException(`Failed to delete folder: ${error.message}`);
    }

    return responseOk('Folder deleted successfully');
  }

  /**
   * deleteUserdataFile — Delete a file from userdata/{userId}/
   * - User can only delete their own files
   * - If deleting avatar, also clear User.avatarUrl
   */
  async deleteUserdataFile(userId: string, filename: string, subPath?: string) {
    this.validateFilename(filename);

    const userFolder = await this.getUserFolder(userId);

    // Build full path
    const basePath = subPath ? `userdata/${userFolder}/${subPath}` : `userdata/${userFolder}`;
    const filePath = `${basePath}/${filename}`;
    const isAvatar = basePath.endsWith('/avatar');

    // Verify file exists
    const { data } = await this.supabase.storage
      .from(BUCKET_NAME)
      .list(basePath, { limit: 200 });

    if (!data?.some((f) => f.name === filename && f.id !== null)) {
      throw new NotFoundException('File not found');
    }

    const { error } = await this.supabase.storage.from(BUCKET_NAME).remove([filePath]);
    if (error) {
      throw new BadRequestException(`Delete failed: ${error.message}`);
    }

    // If avatar deleted, clear avatarUrl
    if (isAvatar) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: null },
      });
    }

    return responseOk('File deleted successfully');
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN — Upload avatar for any user
  // ═══════════════════════════════════════════════════════════════

  /**
   * adminUploadUserdataAvatar — Admin uploads avatar for another user.
   * Also allows self-upload (user uploading their own avatar).
   */
  async adminUploadUserdataAvatar(adminId: string, targetUserId: string, file: Express.Multer.File) {
    if (adminId !== targetUserId) {
      const userIsAdmin = await this.isAdmin(adminId);
      if (!userIsAdmin) {
        throw new ForbiddenException('Only admin can upload avatar for other users');
      }
    }

    return this.uploadUserdataAvatar(targetUserId, file);
  }

  /**
   * adminListUserdataAvatars — List avatars for a user.
   * Admin can list any user's avatars; regular users can list their own.
   */
  async adminListUserdataAvatars(adminId: string, targetUserId: string) {
    if (adminId !== targetUserId) {
      const userIsAdmin = await this.isAdmin(adminId);
      if (!userIsAdmin) {
        throw new ForbiddenException('Only admin can list avatars for other users');
      }
    }

    return this.listUserdataAvatars(targetUserId);
  }

  /**
   * adminSelectUserdataAvatar — Select an existing avatar for a user.
   * Admin can select for any user; regular users can select their own.
   */
  async adminSelectUserdataAvatar(adminId: string, targetUserId: string, filename: string) {
    if (adminId !== targetUserId) {
      const userIsAdmin = await this.isAdmin(adminId);
      if (!userIsAdmin) {
        throw new ForbiddenException('Only admin can select avatar for other users');
      }
    }

    return this.selectUserdataAvatar(targetUserId, filename);
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN — General upload (icon, custom folders)
  // ═══════════════════════════════════════════════════════════════

  /**
   * uploadFiles — Handle batch file uploads to Supabase Storage (admin only).
   */
  async uploadFiles(
    folder: string,
    files: Express.Multer.File[],
    userId: string,
  ): Promise<{ uploaded: UploadResult[]; errors: string[] }> {
    this.validateFolderName(folder);

    const validFiles = files.filter((f) => f != null);
    if (validFiles.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin) {
      throw new ForbiddenException('Only admin can upload to this folder');
    }

    if (validFiles.length > MAX_FILES) {
      throw new BadRequestException(`Too many files. Maximum ${MAX_FILES} files per upload.`);
    }

    const config = this.getFolderConfig(folder);
    const results: UploadResult[] = [];
    const errors: string[] = [];

    for (const file of validFiles) {
      if (!file || !file.buffer) {
        errors.push(`"${file?.originalname || 'unknown'}": invalid file data`);
        continue;
      }

      if (file.size > config.maxSize) {
        errors.push(`"${file.originalname}": too large (max ${config.maxSize / 1024 / 1024}MB)`);
        continue;
      }

      if (!ALLOWED_MIMES.includes(file.mimetype)) {
        errors.push(`"${file.originalname}": invalid type "${file.mimetype}" (only JPEG, PNG)`);
        continue;
      }

      try {
        const processedBuffer = await this.processImage(file.buffer, config.maxDim);

        const timestamp = Date.now();
        const baseName = file.originalname
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        const filePath = `${folder}/${baseName}_${timestamp}.jpg`;

        const { error } = await this.supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, processedBuffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (error) {
          if (error.message?.includes('quota') || error.message?.includes('storage')) {
            errors.push(`"${file.originalname}": Storage quota exceeded or storage unavailable`);
          } else {
            errors.push(`"${file.originalname}": storage error — ${error.message}`);
          }
          continue;
        }

        const url = this.getPublicUrl(filePath);

        results.push({
          url,
          filename: file.originalname,
          size: processedBuffer.length,
          folder,
        });
      } catch (err: any) {
        errors.push(`"${file.originalname}": processing error — ${err.message}`);
      }
    }

    if (results.length === 0 && errors.length > 0) {
      throw new BadRequestException(`All uploads failed: ${errors.join('; ')}`);
    }

    return { uploaded: results, errors };
  }

  /**
   * listFiles — List files in a folder (admin only).
   */
  async listFiles(folder: string, userId: string) {
    this.validateFolderName(folder);

    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin) {
      throw new ForbiddenException('Only admin can list files in this folder');
    }

    const { data, error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .list(folder, {
        limit: 200,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      throw new BadRequestException(`Failed to list files: ${error.message}`);
    }

    const files = (data || [])
      .filter((item) => item.id !== null)
      .map((item) => {
        const filePath = `${folder}/${item.name}`;
        return {
          name: item.name,
          url: this.getPublicUrl(filePath),
          size: item.metadata?.size || 0,
          created_at: item.created_at || '',
          mimetype: item.metadata?.mimetype || 'image/jpeg',
        };
      });

    return responseOk('Files listed successfully', files);
  }

  /**
   * deleteFile — Delete a single file (admin only).
   */
  async deleteFile(folder: string, filename: string, userId: string) {
    this.validateFolderName(folder);
    this.validateFilename(filename);

    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin) {
      throw new ForbiddenException('Only admin can delete files in this folder');
    }

    const filePath = `${folder}/${filename}`;
    const { error } = await this.supabase.storage.from(BUCKET_NAME).remove([filePath]);

    if (error) {
      throw new BadRequestException(`Delete failed: ${error.message}`);
    }

    return responseOk('File deleted successfully');
  }

  // ═══════════════════════════════════════════════════════════════
  // ICONS — System folder for sharing content icons
  // ═══════════════════════════════════════════════════════════════

  /**
   * listIcons — List all icon files in the icon/ folder.
   * Returns proxy URLs for secure access.
   * All users can read icons (for sharing content dropdown), only admin can upload/delete.
   */
  async listIcons(userId: string) {
    try {
      // Find admin user to get the shared icon folder
      const adminUser = await this.prisma.user.findFirst({
        where: { role: { name: 'ADMIN' } },
        select: { id: true },
      });

      if (!adminUser) {
        return responseOk('Icons listed successfully', []);
      }

      const adminFolder = await this.getUserFolder(adminUser.id);
      const iconPath = `userdata/${adminFolder}/icon`;

      const { data } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(iconPath, {
          limit: 200,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (!data) return responseOk('Icons listed successfully', []);

      const icons = data
        .filter((item) => item.id !== null && item.name !== '.keep')
        .map((item) => {
          const filePath = `${iconPath}/${item.name}`;
          return {
            name: item.name,
            url: this.getPublicUrl(filePath),
            path: filePath,
            size: item.metadata?.size || 0,
            created_at: item.created_at || '',
          };
        });

      return responseOk('Icons listed successfully', icons);
    } catch {
      return responseOk('Icons listed successfully', []);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FOLDER CRUD (admin only)
  // ═══════════════════════════════════════════════════════════════

  async listFolders() {
    const folders = await this.prisma.folder.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return responseOk('Folders fetched successfully', folders);
  }

  async createFolder(data: { name: string; displayName: string; description?: string }) {
    const name = data.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!name || name.length < 2) {
      throw new BadRequestException('Folder name must be at least 2 characters');
    }

    if (BUILT_IN_FOLDERS[name]) {
      throw new BadRequestException(`"${name}" is a reserved system folder name`);
    }

    const existing = await this.prisma.folder.findUnique({ where: { name } });
    if (existing) {
      throw new BadRequestException(`Folder "${name}" already exists`);
    }

    const folder = await this.prisma.folder.create({
      data: {
        name,
        displayName: data.displayName || name,
        description: data.description || null,
        isSystem: false,
      },
    });

    return responseCreated('Folder created successfully', folder);
  }

  async deleteFolder(name: string) {
    const folder = await this.prisma.folder.findUnique({ where: { name } });
    if (!folder) {
      throw new NotFoundException(`Folder "${name}" not found`);
    }
    if (folder.isSystem) {
      throw new BadRequestException('Cannot delete system folder');
    }

    // Remove files from storage (best effort)
    try {
      const { data } = await this.supabase.storage.from(BUCKET_NAME).list(name);
      if (data && data.length > 0) {
        const filePaths = data.filter((f) => f.id !== null).map((f) => `${name}/${f.name}`);
        if (filePaths.length > 0) {
          await this.supabase.storage.from(BUCKET_NAME).remove(filePaths);
        }
      }
    } catch {
      // Storage might not have the folder
    }

    await this.prisma.folder.delete({ where: { name } });
    return responseOk('Folder deleted successfully');
  }

  // ═══════════════════════════════════════════════════════════════
  // HOMEPAGE — Admin homepage content management
  // ═══════════════════════════════════════════════════════════════

  private readonly HOMEPAGE_FOLDER_BASE = 'homepage';
  private readonly HOMEPAGE_SUBFOLDERS = ['hapic', 'slideshowpics', 'tourguidepic'] as const;

  async setupHomepageFolders(userId: string) {
    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin) {
      throw new ForbiddenException('Only admin users can setup homepage folders');
    }

    const userFolder = await this.getUserFolder(userId);
    const homepageBase = `userdata/${userFolder}/${this.HOMEPAGE_FOLDER_BASE}`;
    const createdFolders: string[] = [];

    for (const subfolder of this.HOMEPAGE_SUBFOLDERS) {
      const folderPath = `${homepageBase}/${subfolder}`;
      const { data: existing } = await this.supabase.storage
        .from(BUCKET_NAME)
        .list(folderPath, { limit: 1 });

      if (!existing || existing.length === 0) {
        const { error } = await this.supabase.storage
          .from(BUCKET_NAME)
          .upload(`${folderPath}/.keep`, new Uint8Array(0), {
            contentType: 'application/octet-stream',
            upsert: true,
          });

        if (error) {
          throw new BadRequestException(`Failed to create folder ${subfolder}: ${error.message}`);
        }

        createdFolders.push(subfolder);
      }
    }

    return responseCreated('Homepage folders setup successfully', {
      userFolder,
      homepagePath: homepageBase,
      createdFolders,
      allFolders: this.HOMEPAGE_SUBFOLDERS,
    });
  }

  async getHomepageData(userId: string) {
    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin) {
      throw new ForbiddenException('Only admin users can access homepage data');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    const userFolder = await this.getUserFolder(userId);
    const homepageBase = `userdata/${userFolder}/${this.HOMEPAGE_FOLDER_BASE}`;

    const data: any = {
      avatar: user?.avatarUrl || null,
      hapic: [],
      slideshowpics: [],
      tourguidepic: [],
    };

    for (const subfolder of this.HOMEPAGE_SUBFOLDERS) {
      const folderPath = `${homepageBase}/${subfolder}`;

      try {
        const { data: files } = await this.supabase.storage
          .from(BUCKET_NAME)
          .list(folderPath, {
            limit: 200,
            sortBy: { column: 'created_at', order: 'desc' },
          });

        if (files) {
          const images = files
            .filter((item) => item.id !== null && item.name !== '.keep')
            .map((item) => {
              const filePath = `${folderPath}/${item.name}`;
              return {
                name: item.name,
                url: this.getPublicUrl(filePath),
                path: filePath,
                size: item.metadata?.size || 0,
                created_at: item.created_at || '',
              };
            });

          data[subfolder] = images;
        }
      } catch {
        // Folder might not exist yet
      }
    }

    return responseOk('Homepage data fetched successfully', data);
  }

  async streamHomepageFile(userId: string, filePath: string): Promise<{ stream: Readable; contentType: string; filename: string }> {
    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin) {
      throw new ForbiddenException('Only admin users can access homepage files');
    }

    if (filePath.includes('..') || filePath.includes('\\')) {
      throw new BadRequestException('Invalid file path');
    }

    const userFolder = await this.getUserFolder(userId);
    const expectedBase = `userdata/${userFolder}/${this.HOMEPAGE_FOLDER_BASE}`;

    if (!filePath.startsWith(expectedBase)) {
      throw new ForbiddenException('Access denied: invalid file path');
    }

    const { data, error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .download(filePath);

    if (error || !data) {
      throw new NotFoundException('File not found');
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const stream = Readable.from(buffer);

    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    };
    const contentType = mimeMap[ext] || 'image/jpeg';
    const filename = filePath.split('/').pop() || 'file';

    return { stream, contentType, filename };
  }

  async uploadHomepageImage(
    userId: string,
    folder: string,
    file: Express.Multer.File,
  ) {
    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin) {
      throw new ForbiddenException('Only admin users can upload homepage images');
    }

    if (!this.HOMEPAGE_SUBFOLDERS.includes(folder as any)) {
      throw new BadRequestException(`Invalid folder. Must be one of: ${this.HOMEPAGE_SUBFOLDERS.join(', ')}`);
    }

    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    await this.setupHomepageFolders(userId);

    const userFolder = await this.getUserFolder(userId);
    const folderPath = `userdata/${userFolder}/${this.HOMEPAGE_FOLDER_BASE}/${folder}`;

    const ext = file.originalname.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const baseName = file.originalname
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${folderPath}/${baseName}_${timestamp}.${ext}`;

    const { error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }

    const url = this.getPublicUrl(filePath);

    return responseCreated('Image uploaded successfully', {
      url,
      filename: file.originalname,
      path: filePath,
      size: file.buffer.length,
      folder,
    });
  }

  async deleteHomepageImage(userId: string, folder: string, filename: string) {
    const userIsAdmin = await this.isAdmin(userId);
    if (!userIsAdmin) {
      throw new ForbiddenException('Only admin users can delete homepage images');
    }

    if (!this.HOMEPAGE_SUBFOLDERS.includes(folder as any)) {
      throw new BadRequestException(`Invalid folder. Must be one of: ${this.HOMEPAGE_SUBFOLDERS.join(', ')}`);
    }

    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename');
    }

    const userFolder = await this.getUserFolder(userId);
    const filePath = `userdata/${userFolder}/${this.HOMEPAGE_FOLDER_BASE}/${folder}/${filename}`;

    const { error } = await this.supabase.storage.from(BUCKET_NAME).remove([filePath]);

    if (error) {
      throw new BadRequestException(`Delete failed: ${error.message}`);
    }

    return responseOk('Image deleted successfully');
  }

  async getPublicHomepageData() {
    const adminUser = await this.prisma.user.findFirst({
      where: { role: { name: 'ADMIN' } },
      select: { id: true, avatarUrl: true, fullname: true },
    });

    if (!adminUser) {
      return responseOk('Homepage data fetched', {
        avatar: null,
        slideshowpics: [],
        tourguidepic: [],
      });
    }

    const userFolder = await this.getUserFolder(adminUser.id);
    const homepageBase = `userdata/${userFolder}/${this.HOMEPAGE_FOLDER_BASE}`;

    const data: any = {
      avatar: adminUser.avatarUrl || null,
      slideshowpics: [],
      tourguidepic: [],
    };

    for (const subfolder of ['slideshowpics', 'tourguidepic'] as const) {
      const folderPath = `${homepageBase}/${subfolder}`;

      try {
        const { data: files } = await this.supabase.storage
          .from(BUCKET_NAME)
          .list(folderPath, {
            limit: 200,
            sortBy: { column: 'created_at', order: 'desc' },
          });

        if (files) {
          const images = files
            .filter((item) => item.id !== null && item.name !== '.keep')
            .map((item) => {
              const filePath = `${folderPath}/${item.name}`;
              return {
                name: item.name,
                url: this.getPublicUrl(filePath),
              };
            });

          data[subfolder] = images;
        }
      } catch {
        // Folder might not exist yet
      }
    }

    return responseOk('Homepage data fetched', data);
  }
}
