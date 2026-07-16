import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsUUID } from 'class-validator';

/**
 * CreateRoleDto — Validation for creating a new role.
 * - name: 2-50 characters (e.g. "MANAGER", "EDITOR").
 */
export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name!: string;
}

/**
 * UpdateRoleDto — Validation for updating a role.
 * - id: Required UUID of the role to update.
 * - name: Optional new name (2-50 chars).
 * - permissionIds: Optional array of permission UUIDs (replaces all role permissions).
 */
export class UpdateRoleDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}

/**
 * DeleteRoleDto — Validation for deleting a role.
 * - id: Required UUID of the role to delete.
 */
export class DeleteRoleDto {
  @IsUUID()
  id!: string;
}
