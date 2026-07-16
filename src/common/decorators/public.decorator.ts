import { SetMetadata } from '@nestjs/common';

/**
 * Public — Decorator to mark a route as public (no authentication required).
 *
 * When applied to a route handler or controller:
 *   - JwtAuthGuard skips JWT validation.
 *   - RolesGuard skips permission checking.
 *
 * Usage:
 *   @Public()
 *   @Post('signin')
 *   signin() { ... }
 *
 *   @Public()
 *   @Get('public/user/:userId')
 *   findPublicByUser() { ... }
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
