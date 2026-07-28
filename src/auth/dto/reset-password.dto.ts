import { IsEmail, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * RequestResetDto — Validation for requesting a password reset email.
 * Only requires a valid email address.
 */
export class RequestResetDto {
  @IsEmail()
  email!: string;
}

/**
 * ResetPasswordDto — Validation for resetting a password with a token.
 * - token: The reset token received via email.
 * - email: The user's email address.
 * - newPassword: The new password (min 8 chars).
 */
export class ResetPasswordDto {
  @IsNotEmpty()
  token!: string;

  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=])[A-Za-z\d@$!%*?&#^()_+\-=]{8,}$/, {
    message: 'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
  })
  newPassword!: string;
}
