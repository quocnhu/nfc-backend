import { IsUUID } from 'class-validator';

/**
 * SelectTemplateDto — Validation for choosing the active NFC template.
 * - templateId: Required UUID of a template available to the user's role.
 */
export class SelectTemplateDto {
  @IsUUID()
  templateId!: string;
}
