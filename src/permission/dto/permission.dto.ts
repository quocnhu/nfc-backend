import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsUUID } from 'class-validator';

/**
 * CreatePermissionDto — Validation for creating a new permission.
 * - name: 3-100 characters, format "action:resource" (e.g. "create:user", "read:dashboard").
 */
export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name!: string;
}

/**
 * UpdatePermissionDto — Validation for updating a permission.
 * - id: Required UUID of the permission to update.
 * - name: Optional new name (3-100 chars).
 */
export class UpdatePermissionDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;
}

/**
 * DeletePermissionDto — Validation for deleting a permission.
 * - id: Required UUID of the permission to delete.
 */
export class DeletePermissionDto {
  @IsUUID()
  id!: string;
}
