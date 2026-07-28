import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsString,
  IsOptional,
  IsEnum,
  Matches,
} from 'class-validator';

/**
 * SignupDto — Validation for the registration request body.
 *
 * Password rules (enforced via regex):
 *   - At least 8 characters
 *   - At least 1 uppercase letter (A-Z)
 *   - At least 1 lowercase letter (a-z)
 *   - At least 1 digit (0-9)
 *   - At least 1 special character (@$!%*?&#^()_+-=)
 *
 * Fullname rules:
 *   - 2-100 characters
 *   - Letters and spaces only (supports Vietnamese characters)
 */
export class SignupDto {
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
  @MinLength(2, { message: 'Fullname must be at least 2 characters' })
  @MaxLength(100, { message: 'Fullname must not exceed 100 characters' })
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, { message: 'Fullname must only contain letters and spaces' })
  fullname!: string;

  @IsOptional()
  @IsEnum(['LOCAL', 'GOOGLE'], { message: 'userType must be LOCAL or GOOGLE' })
  userType?: 'LOCAL' | 'GOOGLE';
}
