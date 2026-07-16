import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class AuthService {
  private transporter: nodemailer.Transporter;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {
    // Initialize the email transporter for sending password reset emails
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

  /**
   * signup — Create a new user account.
   * 1. Check if email already exists → throw 403 if duplicate.
   * 2. Hash the password with bcrypt (10 salt rounds).
   * 3. Create the user in DB, connecting the default "USER" role.
   * 4. Generate a JWT token and return it (controller sets it as httpOnly cookie).
   */
  async signup(dto: SignupDto) {
    // Step 1: Check for existing user with the same email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ForbiddenException('Email already exists');
    }

    // Step 2: Hash the plaintext password before storing
    const hash = await bcrypt.hash(dto.password, 10);

    // Step 3: Create user with default USER role
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hash,
        fullname: dto.fullname,
        role: {
          connect: { name: 'USER' },
        },
      },
    });

    // Step 4: Generate JWT token (controller will set it as httpOnly cookie)
    const token = await this.signToken(user.id, user.email);

    return responseCreated('Account created successfully', token);
  }

  /**
   * signin — Authenticate an existing user.
   * 1. Find user by email → throw 403 if not found.
   * 2. Compare password with bcrypt hash → throw 403 if mismatch.
   * 3. Generate a JWT token and return it (controller sets it as httpOnly cookie).
   */
  async signin(dto: SigninDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new ForbiddenException('Credentials incorrect');
    }

    const pwMatches = await bcrypt.compare(dto.password, user.password);
    if (!pwMatches) {
      throw new ForbiddenException('Credentials incorrect');
    }

    const token = await this.signToken(user.id, user.email);

    return {
      statusCode: 200,
      success: true,
      message: 'Sign in successfully',
      data: {
        access_token: token.access_token,
      },
    };
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
