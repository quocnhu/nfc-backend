import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma/prisma.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { responseOk, responseCreated } from '../common/helpers/response.helper';

// sharp 0.35+ ships ESM types only; use require for CJS compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp') as (input: Buffer | Uint8Array) => {
  resize: (w: number, h: number, opts?: any) => any;
  jpeg: (opts?: any) => any;
  toBuffer: () => Promise<Buffer>;
};

const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2MB
const AVATAR_WIDTH = 256;
const AVATAR_HEIGHT = 256;

@Injectable()
export class AvatarService {
  private supabase: SupabaseClient;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    // Initialize Supabase client with service role key (full access)
    this.supabase = createClient(
      this.config.get('SUPABASE_URL')!,
      this.config.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  /**
   * uploadAvatar — Upload and process the user's avatar image.
   * 1. Validate file exists and is within size limit (2MB).
   * 2. Validate MIME type (jpeg, png, webp only).
   * 3. Process with sharp: resize to 256x256, convert to JPEG (quality 85).
   * 4. Upload to Supabase Storage at "avatars/{userId}.jpg" (upsert).
   * 5. Get the public URL and append cache-busting timestamp.
   * 6. Save the avatarUrl to the user record in DB.
   */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    // Step 1: Validate file exists
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Step 2: Validate file size
    if (file.size > AVATAR_MAX_SIZE) {
      throw new BadRequestException(`File too large. Maximum size is ${AVATAR_MAX_SIZE / 1024 / 1024}MB`);
    }

    // Step 3: Validate MIME type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: jpeg, png, webp');
    }

    // Step 4: Process image — resize to 256x256, convert to JPEG
    const processedBuffer = await sharp(file.buffer)
      .resize(AVATAR_WIDTH, AVATAR_HEIGHT, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();

    // Step 5: Upload to Supabase Storage
    const filePath = `avatars/${userId}.jpg`;

    const { error } = await this.supabase.storage
      .from('avatars')
      .upload(filePath, processedBuffer, {
        contentType: 'image/jpeg',
        upsert: true, // overwrite if already exists
      });

    if (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }

    // Step 6: Get public URL with cache-busting timestamp
    const { data: urlData } = this.supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Step 7: Save URL to user record
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return responseCreated('Avatar uploaded successfully', { avatarUrl });
  }

  /**
   * getAvatar — Get the logged-in user's avatar URL.
   * Returns { avatarUrl: string | null }. Null if no avatar uploaded yet.
   */
  async getAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    return responseOk('Avatar fetched successfully', { avatarUrl: user?.avatarUrl || null });
  }

  /**
   * deleteAvatar — Delete the user's avatar.
   * 1. Check if user has an avatar → return early if not.
   * 2. Remove the file from Supabase Storage.
   * 3. Set avatarUrl to null in the user record.
   */
  async deleteAvatar(userId: string) {
    // Step 1: Check if avatar exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (!user?.avatarUrl) {
      return responseOk('No avatar to delete');
    }

    // Step 2: Remove from Supabase Storage
    const filePath = `avatars/${userId}.jpg`;
    await this.supabase.storage.from('avatars').remove([filePath]);

    // Step 3: Clear the URL in DB
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    return responseOk('Avatar deleted successfully');
  }
}
