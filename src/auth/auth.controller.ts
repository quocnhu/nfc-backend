import { Body, Controller, Get, Post, HttpCode, HttpStatus, Res, Req, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '@/auth/auth.service';
import { SignupDto } from '@/auth/dto/signup.dto';
import { SigninDto } from '@/auth/dto/signin.dto';
import { RequestResetDto, ResetPasswordDto } from '@/auth/dto/reset-password.dto';
import { Public } from '@/common/decorators/public.decorator';
import { SkipSubscription } from '@/common/decorators/skip-subscription.decorator';

const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, token: string | undefined, maxAge: number) {
  if (!token) return;
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie('refresh_token', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Public()
  @Get('registration-status')
  registrationStatus() {
    return {
      statusCode: 200,
      success: true,
      data: { enabled: this.config.get('REGISTRATION_ENABLED') !== 'false' },
    };
  }
  @Public()
  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
  ) {
    if (this.config.get('REGISTRATION_ENABLED') === 'false') {
      return { statusCode: 403, success: false, message: 'Registration is currently disabled' };
    }
    const result = await this.authService.signup(dto);
    return { statusCode: result.statusCode, success: result.success, message: result.message };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('signin')
  async signin(
    @Body() dto: SigninDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = (req as any).ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';
    const result = await this.authService.signin(dto, ip as string, userAgent as string);
    res.cookie('jwt', result.data?.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_COOKIE_MAX_AGE,
      path: '/',
    });
    setRefreshCookie(res, result.data?.refresh_token, REFRESH_COOKIE_MAX_AGE);
    return {
      statusCode: result.statusCode,
      success: result.success,
      message: result.message,
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    const result = await this.authService.refreshTokens(refreshToken);
    res.cookie('jwt', result.data?.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_COOKIE_MAX_AGE,
      path: '/',
    });
    setRefreshCookie(res, result.data?.refresh_token, REFRESH_COOKIE_MAX_AGE);
    return { statusCode: result.statusCode, success: result.success, message: result.message };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('request-reset-password')
  requestResetPassword(@Body() dto: RequestResetDto) {
    return this.authService.requestResetPassword(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(@Body() dto: { token: string; email: string }) {
    return this.authService.verifyEmail(dto.token, dto.email);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  resendVerification(@Body() dto: { email: string }) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google')
  googleAuth() {}

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  async googleCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = (req as any).user;
    const result = await this.authService.googleLogin(profile);

    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/api/auth/google/callback?access_token=${result.data?.access_token}&refresh_token=${result.data?.refresh_token}`;
    res.redirect(redirectUrl);
  }

  @SkipSubscription()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }
    res.clearCookie('jwt', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    clearRefreshCookie(res);
    return { statusCode: 200, success: true, message: 'Logged out successfully' };
  }
}
