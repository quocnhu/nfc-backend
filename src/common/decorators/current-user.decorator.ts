import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * CurrentUser — Custom parameter decorator to extract the authenticated user.
 *
 * After JwtStrategy validates the JWT, NestJS attaches the user payload
 * to request.user. This decorator provides a clean way to access it.
 *
 * Usage:
 *   @CurrentUser() user           → returns the full user object { sub, email }
 *   @CurrentUser('sub') userId    → returns just the user ID string
 *   @CurrentUser('email') email   → returns just the email string
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    // Get the HTTP request object
    const request = ctx.switchToHttp().getRequest();
    // Get the user that was attached by JwtStrategy
    const user = request.user;
    // If a specific property was requested, return just that; otherwise return full user
    return data ? user?.[data] : user;
  },
);
