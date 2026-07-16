import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * SigninDto — Validation for the login request body.
 * Fields: email (valid format), password (not empty, max 128 chars).
 */
export class SigninDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
