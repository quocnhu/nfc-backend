import { Body, Controller, Post, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';
import { RequestResetDto, ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../common/decorators/public.decorator';

// JWT cookie expires in 15 minutes (matches the token expiry set in AuthService)
const COOKIE_MAX_AGE = 15 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /auth/signup — Register a new user account.
   * 1. Validates email, password, fullname via SignupDto.
   * 2. Creates user in DB with hashed password and default USER role.
   * 3. Generates a JWT and sets it as an httpOnly cookie.
   * 4. Returns success message only — token is never exposed in the response body.
   */
  @Public()
  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signup(dto);
    res.cookie('jwt', result.data?.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return { statusCode: result.statusCode, success: result.success, message: result.message };
  }

  /**
   * POST /auth/signin — Login with email and password.
   * 1. Validates email and password via SigninDto.
   * 2. Checks credentials against bcrypt hash in DB.
   * 3. Generates a JWT and sets it as an httpOnly cookie.
   * 4. Returns success message only — token is never exposed in the response body.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('signin')
  async signin(
    @Body() dto: SigninDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signin(dto);
    res.cookie('jwt', result.data?.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return {
      statusCode: result.statusCode,
      success: result.success,
      message: result.message,
    };
  }

  /**
   * POST /auth/request-reset-password — Request a password reset link.
   * 1. Validates email via RequestResetDto.
   * 2. Generates a random 32-byte hex token and stores it in DB with 15min expiry.
   * 3. Sends an email with a reset link containing the token.
   * 4. Always returns success message (even if email doesn't exist) to prevent enumeration.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('request-reset-password')
  requestResetPassword(@Body() dto: RequestResetDto) {
    return this.authService.requestResetPassword(dto);
  }

  /**
   * POST /auth/reset-password — Reset password using the token from email.
   * 1. Validates token, email, and new password via ResetPasswordDto.
   * 2. Checks that the token exists in DB and hasn't expired.
   * 3. Hashes the new password and updates the user record.
   * 4. Deletes the reset token from DB (one-time use).
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /**
   * POST /auth/logout — Clear the JWT cookie.
   * 1. Clears the httpOnly "jwt" cookie from the browser.
   * 2. Returns success message.
   * Note: The JWT itself remains valid until it expires (stateless JWT).
   */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jwt', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return { statusCode: 200, success: true, message: 'Logged out successfully' };
  }
}
