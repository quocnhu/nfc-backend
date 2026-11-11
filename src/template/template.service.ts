import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { responseOk } from '@/common/helpers/response.helper';

@Injectable()
export class TemplateService {
  constructor(private prisma: PrismaService) {}

  private static readonly DEFAULT_SLUG_BY_ROLE: Record<string, string> = {
    ADMIN: 'real-estate',
    LOCAL: 'real-estate',
    VIP: 'real-estate',
    COMPANY: 'classic',
    USER: 'classic',
  };

  /**
   * Templates the given role is allowed to use, ordered for display.
   */
  private async getTemplatesForRole(roleId: string) {
    return this.prisma.template.findMany({
      where: {
        isActive: true,
        roles: { some: { roleId } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Resolve the template a user should render, falling back to the role's
   * default template (or the first available one) when the stored selection
   * is missing or no longer allowed. Returns null when the role has no
   * templates.
   */
  async resolveForRole(roleId: string, templateId?: string | null, roleName?: string | null) {
    const templates = await this.getTemplatesForRole(roleId);
    const defaultSlug = roleName
      ? TemplateService.DEFAULT_SLUG_BY_ROLE[roleName.toUpperCase()]
      : undefined;
    const selected =
      templates.find((t) => t.id === templateId) ??
      templates.find((t) => t.slug === defaultSlug) ??
      templates[0] ??
      null;
    return { templates, selected };
  }

  /**
   * GET /templates/me — list templates available to the logged-in user's role
   * plus their currently selected template.
   */
  async getForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roleId: true,
        templateId: true,
        role: { select: { name: true } },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const { templates, selected } = await this.resolveForRole(
      user.roleId,
      user.templateId,
      user.role.name,
    );

    return responseOk('Templates fetched successfully', {
      role: user.role.name,
      templates,
      selectedTemplateId: selected?.id ?? null,
    });
  }

  /**
   * POST /templates/me/select — set the template shown when the user's NFC
   * card is tapped. The template must be available to the user's role.
   */
  async select(userId: string, templateId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roleId: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const template = await this.prisma.template.findFirst({
      where: {
        id: templateId,
        isActive: true,
        roles: { some: { roleId: user.roleId } },
      },
    });

    if (!template) {
      throw new ForbiddenException('This template is not available for your role');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { templateId },
    });

    return responseOk('Template selected successfully', template);
  }
}
