import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';
import { CreateQRDto } from '@/qr/dto/qr.dto';

@Injectable()
export class QRService {
  constructor(private prisma: PrismaService) {}

  /**
   * listQRCodes — List all QR codes for the logged-in user.
   */
  async listQRCodes(userId: string) {
    const qrCodes = await this.prisma.qRCode.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return responseOk('QR codes fetched successfully', qrCodes);
  }

  /**
   * createQR — Create a new QR code record.
   * The frontend will generate the QR image from the URL.
   */
  async createQR(userId: string, dto: CreateQRDto) {
    const name = dto.name.trim();
    if (!name || name.length < 1) {
      throw new BadRequestException('QR code name is required');
    }

    const url = dto.url.trim();
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    const qrCode = await this.prisma.qRCode.create({
      data: {
        userId,
        name,
        url,
      },
    });

    return responseCreated('QR code created successfully', qrCode);
  }

  /**
   * deleteQR — Delete a QR code record.
   * User can only delete their own QR codes.
   */
  async deleteQR(userId: string, qrId: string) {
    const qrCode = await this.prisma.qRCode.findUnique({
      where: { id: qrId },
    });

    if (!qrCode) {
      throw new NotFoundException('QR code not found');
    }

    if (qrCode.userId !== userId) {
      throw new ForbiddenException('You can only delete your own QR codes');
    }

    await this.prisma.qRCode.delete({
      where: { id: qrId },
    });

    return responseOk('QR code deleted successfully');
  }
}
