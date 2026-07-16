import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * JwtStrategy — Passport strategy for validating JWTs from httpOnly cookies.
 *
 * This is used by JwtAuthGuard. The flow:
 *   1. JwtAuthGuard delegates to Passport's JWT strategy.
 *   2. Passport extracts the JWT from the "jwt" httpOnly cookie.
 *   3. Passport verifies the token signature and expiration.
 *   4. The validate() method is called with the decoded payload.
 *   5. The return value is attached to request.user.
 *
 * The JWT payload contains: { sub: userId, email, iat, exp }
 * The validate() method extracts only the fields we need.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      // Extract JWT from the "jwt" httpOnly cookie (not from Authorization header)
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => request?.cookies?.['jwt']
      ]),
      // Reject expired tokens
      ignoreExpiration: false,
      // Secret key for verifying the token signature
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  /**
   * validate — Called after JWT is verified successfully.
   * @param payload — The decoded JWT payload: { sub: userId, email, iat, exp }
   * @returns Object that gets attached to request.user
   *
   * The return value { sub, email } is what @CurrentUser() decorator accesses.
   * This is also what RolesGuard reads from request.user to check permissions.
   */
  async validate(payload: any) {
    return { sub: payload.sub, email: payload.email };
  }
}
