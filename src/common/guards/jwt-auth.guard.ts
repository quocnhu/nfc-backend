import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard — Global JWT authentication guard.
 *
 * Registered as a global guard in AppModule via APP_GUARD.
 * Runs on every request before RolesGuard.
 *
 * Flow:
 *   1. Check if the route is marked @Public() → skip JWT validation.
 *   2. If not public, delegate to Passport's JWT strategy.
 *   3. JwtStrategy extracts the JWT from the httpOnly "jwt" cookie.
 *   4. JwtStrategy validates the token and attaches user to request.user.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Step 1: Check if the route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Step 2: Skip JWT validation for public routes
    if (isPublic) {
      return true;
    }

    // Step 3: Enforce JWT validation for non-public routes
    return super.canActivate(context);
  }
}
