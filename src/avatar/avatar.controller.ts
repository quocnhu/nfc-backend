import {
  Controller,
  Get,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AvatarService } from './avatar.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('avatar')
export class AvatarController {
  constructor(private avatarService: AvatarService) {}

  /**
   * POST /avatar/upload — Upload or replace the user's avatar.
   * Uses multer FileInterceptor to handle multipart/form-data file upload.
   * Max file size: 2MB. Accepts: jpeg, png, webp (validated in service).
   * The image is processed with sharp: resized to 256x256, converted to JPEG.
   * Uploaded to Supabase Storage, and the URL is saved to the user record.
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    }),
  )
  @HttpCode(HttpStatus.OK)
  uploadAvatar(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.avatarService.uploadAvatar(userId, file);
  }

  /**
   * GET /avatar/me — Get the logged-in user's avatar URL.
   * Returns { avatarUrl: string | null }.
   */
  @Get('me')
  getAvatar(@CurrentUser('sub') userId: string) {
    return this.avatarService.getAvatar(userId);
  }

  /**
   * DELETE /avatar/me — Delete the logged-in user's avatar.
   * Removes the file from Supabase Storage and sets avatarUrl to null in DB.
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  deleteAvatar(@CurrentUser('sub') userId: string) {
    return this.avatarService.deleteAvatar(userId);
  }
}
