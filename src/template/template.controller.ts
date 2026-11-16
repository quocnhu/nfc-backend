import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { TemplateService } from '@/template/template.service';
import { SelectTemplateDto } from '@/template/dto/select-template.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

/**
 * TemplateController — template catalog and self-service selection.
 */
@Controller('templates')
export class TemplateController {
  constructor(private templateService: TemplateService) {}

  /**
   * GET /templates — all active templates (for admin role-template assignment).
   */
  @Get()
  findAll() {
    return this.templateService.findAll();
  }

  /**
   * GET /templates/me — templates available to the current user's role and
   * which one is currently selected.
   */
  @Get('me')
  getMine(@CurrentUser('sub') userId: string) {
    return this.templateService.getForUser(userId);
  }

  /**
   * POST /templates/me/select — choose the template shown on NFC tap.
   * Accepts: { templateId }.
   */
  @Post('me/select')
  @HttpCode(HttpStatus.OK)
  select(@CurrentUser('sub') userId: string, @Body() dto: SelectTemplateDto) {
    return this.templateService.select(userId, dto.templateId);
  }
}
