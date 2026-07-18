import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * CreateSharingContentDto — Validation for creating a sharing content item.
 * - url: The URL to share (e.g. website, social media profile).
 * - itemName: Display name for the content item.
 * - icon: Icon identifier (e.g. "star", "link", "globe").
 * - targetUserId: Optional — assign content to a different user (admin only).
 */
export class CreateSharingContentDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsNotEmpty()
  itemName!: string;

  @IsString()
  @IsNotEmpty()
  icon!: string;

  @IsOptional()
  @IsString()
  targetUserId?: string;
}
