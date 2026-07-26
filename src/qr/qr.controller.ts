import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { QRService } from '@/qr/qr.service';
import { CreateQRDto } from '@/qr/dto/qr.dto';

/**
 * QRController — CRUD for user QR codes.
 *
 * GET    /api/qr           — List user's QR codes
 * POST   /api/qr           — Create QR code record
 * DELETE /api/qr/:id       — Delete QR code
 */
@Controller('qr')
export class QRController {
  constructor(private qrService: QRService) {}

  /**
   * GET /qr — List all QR codes for the logged-in user.
   */
  @Get()
  listQRCodes(@CurrentUser('sub') userId: string) {
    return this.qrService.listQRCodes(userId);
  }

  /**
   * POST /qr — Create a new QR code record.
   * Body: { name: string, url: string }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createQR(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateQRDto,
  ) {
    return this.qrService.createQR(userId, dto);
  }

  /**
   * DELETE /qr/:id — Delete a QR code.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteQR(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    return this.qrService.deleteQR(userId, id);
  }

  /**
   * POST /qr/bulk-delete — Delete multiple QR codes.
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  bulkDeleteQR(
    @CurrentUser('sub') userId: string,
    @Body() dto: { ids: string[] },
  ) {
    return this.qrService.bulkDeleteQR(userId, dto.ids);
  }
}
