import { Injectable, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SignupDto } from '@/auth/dto/signup.dto';
import { SigninDto } from '@/auth/dto/signin.dto';
import { RequestResetDto, ResetPasswordDto } from '@/auth/dto/reset-password.dto';
import * as crypto from 'crypto';
import { responseCreated, responseOk } from '@/common/helpers/response.helper';
import { getVerificationEmailTemplate } from '@/auth/templates/verification-email.template';
import { getResendVerificationEmailTemplate } from '@/auth/templates/resend-verification-email.template';
import { getPasswordResetEmailTemplate } from '@/auth/templates/password-reset-email.template';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

@Injectable()
export class AuthService {
  private transporter: nodemailer.Transporter;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: this.config.get('SMTP_PORT'),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
    return token;
  }

  private async deleteRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { token } });
  }

  async signup(dto: SignupDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ForbiddenException('Email already exists');
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hash,
        fullname: dto.fullname,
        role: {
          connect: { name: 'USER' },
        },
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const freePlan = await this.prisma.plan.findUnique({ where: { name: 'FREE' } });
    if (freePlan) {
      const now = new Date();
      const endDate = new Date(now.getTime() + 30 * 60 * 1000);

      await this.prisma.subscription.create({
        data: {
          userId: user.id,
          planId: freePlan.id,
          status: 'TRIAL',
          startDate: now,
          endDate,
          isCurrent: true,
        },
      });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.emailVerification.upsert({
      where: { email: dto.email },
      update: { token: verificationToken, expiresAt },
      create: { email: dto.email, token: verificationToken, expiresAt },
    });

    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}&email=${dto.email}`;

    const emailHtml = getVerificationEmailTemplate(dto.fullname, verifyUrl);

    try {
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'),
        to: dto.email,
        subject: 'Verify Your Email - Quoc Nhu NFC',
        html: emailHtml,
      });
    } catch (error) {
      console.error('Failed to send verification email:', error);
    }

    return responseCreated('Account created. Please check your email to verify your account.', {
      requiresVerification: true,
    });
  }

  async verifyEmail(token: string, email: string) {
    const verificationRecord = await this.prisma.emailVerification.findUnique({
      where: { email },
    });

    if (!verificationRecord || verificationRecord.token !== token) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (new Date() > verificationRecord.expiresAt) {
      throw new BadRequestException('Verification token has expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.isEmailVerified) {
      return responseOk('Email is already verified');
    }

    await this.prisma.user.update({
      where: { email },
      data: { isEmailVerified: true, status: 'ACTIVE' },
    });

    await this.prisma.emailVerification.delete({
      where: { email },
    });

    return responseOk('Email verified successfully. Your account is now active.');
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return responseOk('If the email exists, a verification link has been sent.');
    }

    if (user.isEmailVerified) {
      return responseOk('Email is already verified');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.emailVerification.upsert({
      where: { email },
      update: { token: verificationToken, expiresAt },
      create: { email, token: verificationToken, expiresAt },
    });

    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}&email=${email}`;

    const emailHtml = getResendVerificationEmailTemplate(user.fullname, verifyUrl);

    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM'),
      to: email,
      subject: 'Verify Your Email - Quoc Nhu NFC',
      html: emailHtml,
    });

    return responseOk('Verification email sent. Please check your inbox.');
  }

  async signin(dto: SigninDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      await this.recordLoginAttempt(dto.email, false, 'user_not_found', ip, userAgent);
      throw new ForbiddenException('Credentials incorrect');
    }

    if (!user.isEmailVerified) {
      await this.recordLoginAttempt(dto.email, false, 'email_not_verified', ip, userAgent);
      throw new ForbiddenException('Please verify your email before logging in');
    }

    if (user.status === 'INACTIVE') {
      await this.recordLoginAttempt(dto.email, false, 'account_inactive', ip, userAgent);
      throw new ForbiddenException('Your account is inactive. Please contact an administrator.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      await this.recordLoginAttempt(dto.email, false, 'account_locked', ip, userAgent);
      throw new ForbiddenException(`Account locked. Try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}`);
    }

    const pwMatches = await bcrypt.compare(dto.password, user.password);
    if (!pwMatches) {
      const newCount = user.failedLoginCount + 1;
      const updateData: any = { failedLoginCount: newCount };

      // Lock account after 5 consecutive failed attempts (30 minutes)
      if (newCount >= 5) {
        updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      await this.recordLoginAttempt(dto.email, false, 'wrong_password', ip, userAgent);
      throw new ForbiddenException('Credentials incorrect');
    }

    // Success — reset failed count and lock
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    await this.recordLoginAttempt(dto.email, true, null, ip, userAgent);

    const accessToken = await this.signToken(user.id, user.email);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      statusCode: 200,
      success: true,
      message: 'Sign in successfully',
      data: {
        access_token: accessToken.access_token,
        refresh_token: refreshToken,
        status: user.status,
        expiresAt: user.expiresAt,
      },
    };
  }

  private async recordLoginAttempt(email: string, success: boolean, reason: string | null, ip?: string, userAgent?: string) {
    try {
      await this.prisma.loginAttempt.create({
        data: { email, success, reason, ip, userAgent },
      });
    } catch {}
  }

  async getLoginAttempts(params: { email?: string; ip?: string; since?: Date; limit?: number }) {
    const where: any = {};
    if (params.email) where.email = params.email;
    if (params.ip) where.ip = params.ip;
    if (params.since) where.timestamp = { gte: params.since };

    return this.prisma.loginAttempt.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: params.limit || 50,
    });
  }

  async getFailedLoginAttemptsByIp(since: Date) {
    return this.prisma.loginAttempt.groupBy({
      by: ['ip'],
      where: { success: false, timestamp: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
  }

  async getFailedLoginAttemptsByEmail(since: Date) {
    return this.prisma.loginAttempt.groupBy({
      by: ['email'],
      where: { success: false, timestamp: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
  }

  async refreshTokens(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (new Date() > record.expiresAt) {
      await this.deleteRefreshToken(refreshToken);
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.deleteRefreshToken(refreshToken);

    const newAccessToken = await this.signToken(record.userId, record.user.email);
    const newRefreshToken = await this.generateRefreshToken(record.userId);

    return {
      statusCode: 200,
      success: true,
      message: 'Tokens refreshed',
      data: {
        access_token: newAccessToken.access_token,
        refresh_token: newRefreshToken,
      },
    };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.deleteRefreshToken(token);
  }

  /**
   * requestResetPassword — Send a password reset email.
   * 1. Find user by email. If not found, return generic success (prevent email enumeration).
   * 2. Generate a random 32-byte hex token and store it with 15-minute expiry.
   * 3. Send an email with a link containing the token and email.
   * 4. Always return the same success message regardless of whether user exists.
   */
  async requestResetPassword(dto: RequestResetDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      return responseOk('If the email exists, a reset link has been sent.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.passwordReset.upsert({
      where: { email: dto.email },
      update: { token, expiresAt },
      create: { email: dto.email, token, expiresAt },
    });

    const resetUrl = `http://localhost:4000/auth/reset-password?token=${token}&email=${dto.email}`;

    const emailHtml = getPasswordResetEmailTemplate(resetUrl);

    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM'),
      to: dto.email,
      subject: 'Password Reset Request',
      html: emailHtml,
    });

    return responseOk('If the email exists, a reset link has been sent.');
  }

  /**
   * resetPassword — Reset the user's password using the email token.
   * 1. Find the reset record by email → throw 400 if not found or token mismatch.
   * 2. Check that the token hasn't expired → throw 400 if expired.
   * 3. Hash the new password and update the user record.
   * 4. Delete the reset token from DB (one-time use only).
   */
  async resetPassword(dto: ResetPasswordDto) {
    const resetRecord = await this.prisma.passwordReset.findUnique({
      where: { email: dto.email },
    });

    if (!resetRecord || resetRecord.token !== dto.token) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (new Date() > resetRecord.expiresAt) {
      throw new BadRequestException('Reset token has expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new BadRequestException('User not found');

    const hash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { email: dto.email },
      data: { password: hash },
    });

    await this.prisma.passwordReset.delete({
      where: { email: dto.email },
    });

    return responseOk('Password has been reset successfully');
  }

  /**
   * signToken — Generate a JWT access token.
   * Payload contains: { sub: userId, email }.
   * Token expires in 15 minutes.
   * Signed with the JWT_SECRET from environment variables.
   */
  async signToken(userId: string, email: string): Promise<{ access_token: string }> {
    const payload = { sub: userId, email };
    const secret = this.config.get('JWT_SECRET');

    const token = await this.jwt.signAsync(payload, {
      expiresIn: '15m',
      secret,
    });

    return { access_token: token };
  }
}
