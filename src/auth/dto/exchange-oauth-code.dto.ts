import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * ExchangeOAuthCodeDto — Validation for the one-time OAuth code exchange.
 */
export class ExchangeOAuthCodeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(256)
  code!: string;
}
