import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

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
  @MinLength(8)
  newPassword!: string;
}
