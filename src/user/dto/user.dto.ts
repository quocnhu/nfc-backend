import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsString,
  IsOptional,
  Matches,
  IsUUID,
  IsBoolean,
  IsDateString,
  IsEnum,
} from 'class-validator';

/**
 * CreateUserDto — Validation for creating a new user (admin operation).
 * - email: Valid email format.
 * - password: 8-128 chars, must include uppercase, lowercase, number, special char.
 * - fullname: 2-100 chars, letters and spaces only.
 * - avatarUrl: Optional string (URL to avatar image).
 * - roleId: Optional UUID (if not provided, defaults to "USER" role).
 */
export class CreateUserDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=])[A-Za-z\d@$!%*?&#^()_+\-=]{8,}$/, {
    message: 'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, { message: 'Fullname must only contain letters and spaces' })
  fullname!: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsEnum(['LOCAL', 'GOOGLE'], { message: 'userType must be LOCAL or GOOGLE' })
  userType?: 'LOCAL' | 'GOOGLE';
}

/**
 * UpdateUserDto — Validation for updating a user (admin or self-service).
 * - id: Required UUID (the user ID to update).
 * - All other fields are optional — only provided fields are updated.
 */
export class UpdateUserDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, { message: 'Fullname must only contain letters and spaces' })
  fullname?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=])[A-Za-z\d@$!%*?&#^()_+\-=]{8,}$/, {
    message: 'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
  })
  newPassword?: string;

  @IsOptional()
  @IsBoolean()
  isEmailVerified?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsEnum(['LOCAL', 'GOOGLE'], { message: 'userType must be LOCAL or GOOGLE' })
  userType?: 'LOCAL' | 'GOOGLE';
}

export class ToggleStatusDto {
  @IsUUID()
  id!: string;
}

/**
 * DeleteUserDto — Validation for deleting a user (admin operation).
 * - id: Required UUID of the user to delete.
 */
export class DeleteUserDto {
  @IsUUID()
  id!: string;
}

/**
 * ChangePasswordDto — Validation for changing password (self-service).
 * - currentPassword: Required (for verification before allowing change).
 * - newPassword: 8-128 chars, same strength rules as signup.
 */
export class ChangePasswordDto {
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=])[A-Za-z\d@$!%*?&#^()_+\-=]{8,}$/, {
    message: 'New password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
  })
  newPassword!: string;
}

/**
 * AssignPermissionsDto — Validation for assigning permissions to a user (admin operation).
 * - id: Required UUID of the user to assign permissions to.
 * - permissionIds: Required array of permission UUIDs (replaces all existing permissions).
 */
export class AssignPermissionsDto {
  @IsUUID()
  id!: string;

  @IsNotEmpty()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}

/**
 * AdminChangePasswordDto — Validation for admin changing a user's password.
 * - id: Required UUID of the user.
 * - newPassword: Required new password.
 */
export class AdminChangePasswordDto {
  @IsUUID()
  id!: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=])[A-Za-z\d@$!%*?&#^()_+\-=]{8,}$/, {
    message: 'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
  })
  newPassword!: string;
}

/**
 * UnlockUserDto — Validation for admin unlocking a locked user account.
 * - id: Required UUID of the user to unlock.
 */
export class UnlockUserDto {
  @IsUUID()
  id!: string;
}
