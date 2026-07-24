import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { UploadService } from '@/upload/upload.service';

/**
 * UploadController — Handles file uploads to Supabase Storage.
 *
 * User routes:
 *   POST /upload/userdata/avatar   — Upload/replace avatar (1 file)
 *   POST /upload/userdata/files    — Upload photos (max 2)
 *   GET  /upload/userdata          — List user's files
 *   DELETE /upload/userdata        — Delete user's file (body: { filename })
 *
 * Admin routes:
 *   POST   /upload/:folder         — Upload to any folder
 *   GET    /upload/list/:folder    — List files in any folder
 *   DELETE /upload/:folder/:filename — Delete a file
 *   GET    /upload/folders         — List all folders
 *   POST   /upload/folders         — Create custom folder
 *   DELETE /upload/folders/:name   — Delete custom folder
 */
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  // ═══════════════════════════════════════════════════════════════
  // USERDATA — User's personal folder
  // ═══════════════════════════════════════════════════════════════

  /**
   * POST /upload/userdata/avatar — Upload or replace user's avatar.
   * Field name: "file" (single file)
   */
  @Post('userdata/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadAvatar(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadService.uploadUserdataAvatar(userId, file);
  }

  /**
   * POST /upload/userdata/files — Upload photos to user's folder.
   * Field name: "files", optional "path" field for subfolder
   */
  @Post('userdata/files')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: multer.memoryStorage(),
      limits: { fileSize: 1024 * 1024 * 1024 },
    }),
  )
  @HttpCode(HttpStatus.OK)
  async uploadFiles(
    @CurrentUser('sub') userId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { path?: string },
  ) {
    const result = await this.uploadService.uploadUserdataFiles(userId, files, body.path);
    return {
      statusCode: 200,
      success: true,
      message: `${result.uploaded.length} file(s) uploaded successfully`,
      data: {
        uploaded: result.uploaded,
        errors: result.errors,
      },
    };
  }

  /**
   * GET /upload/userdata — List user's files (avatar + photos).
   */
  @Get('userdata')
  listUserdataFiles(@CurrentUser('sub') userId: string) {
    return this.uploadService.listUserdataFiles(userId);
  }

  /**
   * GET /upload/userdata/browse?path=... — Browse folder contents at a path.
   * Query: { path: string } (e.g. "" for root, "avatar" for avatar folder)
   */
  @Get('userdata/browse')
  @HttpCode(HttpStatus.OK)
  browseUserdata(
    @CurrentUser('sub') userId: string,
    @Body() body: { path: string },
    @Query('path') queryPath: string,
  ) {
    return this.uploadService.browseUserdata(userId, queryPath || body?.path || '');
  }

  /**
   * GET /upload/userdata/file?path=... — Proxy file download through backend.
   * Streams the file from Supabase Storage after verifying user ownership.
   */
  @Get('userdata/file')
  async getFile(
    @CurrentUser('sub') userId: string,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    const { stream, contentType, filename } = await this.uploadService.streamFile(userId, filePath);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    stream.pipe(res);
  }

  /**
   * GET /upload/userdata/storage-usage — Get user's storage usage summary.
   */
  @Get('userdata/storage-usage')
  @HttpCode(HttpStatus.OK)
  getStorageUsage(@CurrentUser('sub') userId: string) {
    return this.uploadService.getUserStorageUsageSummary(userId);
  }

  /**
   * POST /upload/userdata/folder — Create a subfolder in user's userdata.
   * Body: { folderName: string, currentPath?: string }
   */
  @Post('userdata/folder')
  @HttpCode(HttpStatus.CREATED)
  createSubfolder(
    @CurrentUser('sub') userId: string,
    @Body() body: { folderName: string; currentPath?: string },
  ) {
    return this.uploadService.createUserdataFolder(userId, body.folderName, body.currentPath);
  }

  /**
   * DELETE /upload/userdata/folder — Delete a subfolder from user's userdata.
   * Body: { folderPath: string }
   */
  @Delete('userdata/folder')
  @HttpCode(HttpStatus.OK)
  deleteSubfolder(
    @CurrentUser('sub') userId: string,
    @Body() body: { folderPath: string },
  ) {
    return this.uploadService.deleteUserdataFolder(userId, body.folderPath);
  }

  /**
   * DELETE /upload/userdata — Delete a user's file.
   * Body: { filename: string, path?: string }
   */
  @Delete('userdata')
  @HttpCode(HttpStatus.OK)
  deleteUserdataFile(
    @CurrentUser('sub') userId: string,
    @Body() body: { filename: string; path?: string },
  ) {
    return this.uploadService.deleteUserdataFile(userId, body.filename, body.path);
  }

  /**
   * POST /upload/userdata/avatar/upload — Upload avatar for a user.
   * Body: { userId: string } + file
   */
  @Post('userdata/avatar/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async adminUploadAvatar(
    @CurrentUser('sub') adminId: string,
    @Body() body: { userId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadService.adminUploadUserdataAvatar(adminId, body.userId, file);
  }

  /**
   * POST /upload/userdata/avatar/list — List all avatars for a user.
   * Body: { userId: string }
   */
  @Post('userdata/avatar/list')
  @HttpCode(HttpStatus.OK)
  async adminListAvatars(
    @CurrentUser('sub') adminId: string,
    @Body() body: { userId: string },
  ) {
    return this.uploadService.adminListUserdataAvatars(adminId, body.userId);
  }

  /**
   * POST /upload/userdata/avatar/select — Select an existing avatar.
   * Body: { userId: string, filename: string }
   */
  @Post('userdata/avatar/select')
  @HttpCode(HttpStatus.OK)
  async adminSelectAvatar(
    @CurrentUser('sub') adminId: string,
    @Body() body: { userId: string; filename: string },
  ) {
    return this.uploadService.adminSelectUserdataAvatar(adminId, body.userId, body.filename);
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN — Folder management & general upload
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /upload/icons — List all icons (admin only).
   */
  @Get('icons')
  listIcons(@CurrentUser('sub') userId: string) {
    return this.uploadService.listIcons(userId);
  }

  /**
   * GET /upload/folders — List all folders (system + custom).
   */
  @Get('folders')
  listFolders() {
    return this.uploadService.listFolders();
  }

  /**
   * POST /upload/folders — Create a new custom folder.
   */
  @Post('folders')
  @HttpCode(HttpStatus.CREATED)
  createFolder(@Body() body: { name: string; displayName: string; description?: string }) {
    return this.uploadService.createFolder(body);
  }

  /**
   * DELETE /upload/folders/:name — Delete a custom folder + its files.
   */
  @Delete('folders/:name')
  @HttpCode(HttpStatus.OK)
  deleteFolder(@Param('name') name: string) {
    return this.uploadService.deleteFolder(name);
  }

  /**
   * GET /upload/list/:folder — List files in a folder (admin only).
   */
  @Get('list/:folder')
  listFiles(
    @Param('folder') folder: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.uploadService.listFiles(folder, userId);
  }

  // ─── Parameterized routes AFTER static routes ───

  /**
   * POST /upload/:folder — Upload images to a folder (admin only).
   */
  @Post(':folder')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @HttpCode(HttpStatus.OK)
  async uploadAdminFiles(
    @Param('folder') folder: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('sub') userId: string,
  ) {
    const result = await this.uploadService.uploadFiles(folder, files, userId);
    return {
      statusCode: 200,
      success: true,
      message: `${result.uploaded.length} file(s) uploaded successfully to "${folder}"`,
      data: {
        uploaded: result.uploaded,
        errors: result.errors,
      },
    };
  }

  /**
   * DELETE /upload/:folder/:filename — Delete a single file (admin only).
   */
  @Delete(':folder/:filename')
  @HttpCode(HttpStatus.OK)
  deleteFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.uploadService.deleteFile(folder, filename, userId);
  }

  // ═══════════════════════════════════════════════════════════════
  // HOMEPAGE — Public & Admin homepage content management
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /upload/homepage/public — Public endpoint for homepage data.
   * No auth required. Returns avatar, slideshow, tour guide images.
   */
  @Get('homepage/public')
  @Public()
  async getPublicHomepageData() {
    return this.uploadService.getPublicHomepageData();
  }

  /**
   * POST /upload/homepage/setup — Create homepage folder structure for admin user.
   * Creates: homepage/hapic, homepage/slideshowpics, homepage/tourguidepic
   */
  @Post('homepage/setup')
  @HttpCode(HttpStatus.CREATED)
  async setupHomepageFolders(@CurrentUser('sub') userId: string) {
    return this.uploadService.setupHomepageFolders(userId);
  }

  /**
   * GET /upload/homepage/data — Fetch all homepage data for the admin user.
   * Returns: avatar URL, hapic images, slideshow images, tour guide image
   */
  @Get('homepage/data')
  async getHomepageData(@CurrentUser('sub') userId: string) {
    return this.uploadService.getHomepageData(userId);
  }

  /**
   * GET /upload/homepage/file?path=... — Proxy file download through backend.
   * Streams the file from Supabase Storage after verifying admin access.
   */
  @Get('homepage/file')
  async getHomepageFile(
    @CurrentUser('sub') userId: string,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    const { stream, contentType, filename } = await this.uploadService.streamHomepageFile(userId, filePath);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600',
    });
    stream.pipe(res);
  }

  /**
   * POST /upload/homepage/upload — Upload image to a specific homepage folder.
   * Body: { folder: 'hapic' | 'slideshowpics' | 'tourguidepic' }
   * File: "file" (single file)
   */
  @Post('homepage/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadHomepageImage(
    @CurrentUser('sub') userId: string,
    @Body() body: { folder: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadService.uploadHomepageImage(userId, body.folder, file);
  }

  /**
   * DELETE /upload/homepage/delete — Delete image from a specific homepage folder.
   * Body: { folder: 'hapic' | 'slideshowpics' | 'tourguidepic', filename: string }
   */
  @Delete('homepage/delete')
  @HttpCode(HttpStatus.OK)
  async deleteHomepageImage(
    @CurrentUser('sub') userId: string,
    @Body() body: { folder: string; filename: string },
  ) {
    return this.uploadService.deleteHomepageImage(userId, body.folder, body.filename);
  }
}
