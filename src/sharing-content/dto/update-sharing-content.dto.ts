import { IsString, IsNotEmpty, IsOptional, IsUUID, IsArray, ArrayMinSize } from 'class-validator';

/**
 * GetSharingContentDto — Validation for getting a single sharing content item by ID.
 * Used by POST /sharing-content/get. Frontend sends the ID in the request body.
 */
export class GetSharingContentDto {
  @IsUUID()
  id!: string;
}

/**
 * GetPublicUserDto — Validation for getting a user's public profile via NFC.
 * Used by POST /sharing-content/public/user. Frontend sends userId from NFC scan.
 */
export class GetPublicUserDto {
  @IsUUID()
  userId!: string;
}

/**
 * UpdateSharingContentDto — Validation for updating a sharing content item.
 * - id: Required UUID of the item to update.
 * - All other fields are optional — only provided fields are updated.
 */
export class UpdateSharingContentDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  itemName?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

/**
 * DeleteSharingContentDto — Validation for deleting a sharing content item.
 * - id: Required UUID of the item to delete.
 */
export class DeleteSharingContentDto {
  @IsUUID()
  id!: string;
}

/**
 * BulkDeleteSharingContentDto — Validation for deleting multiple sharing content items.
 * - ids: Array of UUIDs to delete.
 */
export class BulkDeleteSharingContentDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[];
}
