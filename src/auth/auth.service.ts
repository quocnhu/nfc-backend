import { Injectable, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';
import { RequestResetDto, ResetPasswordDto } from './dto/reset-password.dto';
import * as crypto from 'crypto';
import { responseCreated, responseOk } from '../common/helpers/response.helper';

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
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes trial
      },
    });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.emailVerification.upsert({
      where: { email: dto.email },
      update: { token: verificationToken, expiresAt },
      create: { email: dto.email, token: verificationToken, expiresAt },
    });

    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}&email=${dto.email}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; border: 0; border-spacing: 0; background: #f4f7fa;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; border: 0; border-spacing: 0; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" style="padding: 40px 30px 20px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <div style="width: 70px; height: 70px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                <span style="color: #ffffff; font-size: 28px; font-weight: bold;">QN</span>
              </div>
              <h1 style="margin: 20px 0 0 0; color: #ffffff; font-size: 24px; font-weight: 600;">Welcome to Quoc Nhu NFC!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 20px; font-weight: 600;">Verify Your Email Address</h2>
              <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                Hi <strong>${dto.fullname}</strong>,
              </p>
              <p style="margin: 0 0 25px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                Thank you for registering! Please click the button below to verify your email address and activate your account.
              </p>
              <table role="presentation" style="border-collapse: collapse; border: 0; border-spacing: 0; margin: 0 auto;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px;">
                    <a href="${verifyUrl}" style="display: inline-block; padding: 14px 40px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 25px 0 0 0; color: #888888; font-size: 14px; line-height: 1.5;">
                Or copy and paste this link into your browser:<br>
                <span style="color: #667eea; word-break: break-all;">${verifyUrl}</span>
              </p>
              <p style="margin: 20px 0 0 0; color: #888888; font-size: 13px; line-height: 1.5;">
                This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; background: #f8f9fa; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #888888; font-size: 12px;">
                &copy; 2026 Quoc Nhu NFC. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

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
      data: { isEmailVerified: true },
    });

    await this.prisma.emailVerification.delete({
      where: { email },
    });

    return responseOk('Email verified successfully. You can now login.');
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

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; border: 0; border-spacing: 0; background: #f4f7fa;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; border: 0; border-spacing: 0; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" style="padding: 40px 30px 20px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <div style="width: 70px; height: 70px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                <span style="color: #ffffff; font-size: 28px; font-weight: bold;">QN</span>
              </div>
              <h1 style="margin: 20px 0 0 0; color: #ffffff; font-size: 24px; font-weight: 600;">Verify Your Email</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 20px; font-weight: 600;">Email Verification Request</h2>
              <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                Hi <strong>${user.fullname}</strong>,
              </p>
              <p style="margin: 0 0 25px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                You requested a new verification link. Please click the button below to verify your email address.
              </p>
              <table role="presentation" style="border-collapse: collapse; border: 0; border-spacing: 0; margin: 0 auto;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px;">
                    <a href="${verifyUrl}" style="display: inline-block; padding: 14px 40px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 25px 0 0 0; color: #888888; font-size: 14px; line-height: 1.5;">
                Or copy and paste this link into your browser:<br>
                <span style="color: #667eea; word-break: break-all;">${verifyUrl}</span>
              </p>
              <p style="margin: 20px 0 0 0; color: #888888; font-size: 13px; line-height: 1.5;">
                This link will expire in 24 hours.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; background: #f8f9fa; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #888888; font-size: 12px;">
                &copy; 2026 Quoc Nhu NFC. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

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

    // Check if account is disabled
    if (user.status === 'DISABLED') {
      await this.recordLoginAttempt(dto.email, false, 'account_disabled', ip, userAgent);
      throw new ForbiddenException('Your account has been disabled. Please contact admin or renew your NFC service.');
    }

    // Check if account has expired
    if (user.expiresAt && user.expiresAt < new Date()) {
      await this.recordLoginAttempt(dto.email, false, 'account_expired', ip, userAgent);
      throw new ForbiddenException('Your NFC service has expired. Please login to renew.');
    }

    // Check if account is locked
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
    // Step 1: Check if user exists (but don't reveal this to the client)
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      return responseOk('If the email exists, a reset link has been sent.');
    }

    // Step 2: Generate a secure random token and set 15-minute expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Step 3: Store or update the reset token in DB (upsert handles re-requests)
    await this.prisma.passwordReset.upsert({
      where: { email: dto.email },
      update: { token, expiresAt },
      create: { email: dto.email, token, expiresAt },
    });

    // Step 4: Build the reset URL and send the email
    const resetUrl = `http://localhost:4000/auth/reset-password?token=${token}&email=${dto.email}`;

    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM'),
      to: dto.email,
      subject: 'Password Reset Request',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 15 minutes.</p>`,
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
    // Step 1: Find the reset record
    const resetRecord = await this.prisma.passwordReset.findUnique({
      where: { email: dto.email },
    });

    if (!resetRecord || resetRecord.token !== dto.token) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Step 2: Check token expiry
    if (new Date() > resetRecord.expiresAt) {
      throw new BadRequestException('Reset token has expired');
    }

    // Step 3: Hash new password and update user
    const hash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { email: dto.email },
      data: { password: hash },
    });

    // Step 4: Delete the used reset token (cannot be reused)
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
