import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * RolesGuard — Automatic permission enforcement.
 *
 * No decorators needed. Permissions are derived automatically from:
 *   1. Controller class name → resource   (UsersController → "user")
 *   2. HTTP method + last route segment → action (GET → "read", POST + "/update" → "update")
 *
 * The guard checks the database to see if the user's role includes
 * the derived "action:resource" permission.
 *
 * Request flow:
 *   1. Skip if @Public() — no auth or permission check.
 *   2. Deny if no authenticated user (request.user missing).
 *   3. Auto-derive permission from controller name + route path.
 *   4. Skip permission check for self-service routes (/me, /public).
 *   5. Fetch user's role permissions + individual permissions from DB.
 *   6. Allow if the derived permission exists in the merged set, otherwise 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Step 1: Skip guard for routes marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Step 2: Ensure the user is authenticated (JwtStrategy sets request.user)
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    // Step 3: Auto-derive the required permission from controller + route
    const controllerClass = context.getClass();
    const resource = this.deriveResource(controllerClass);
    const action = this.deriveAction(request.method, request.route?.path || '');

    // Step 4: Self-service routes (/me, /public) — any authenticated user can access
    if (this.isSelfServiceRoute(request.route?.path || '')) {
      return true;
    }

    const requiredPermission = `${action}:${resource}`;

    // Step 5: Fetch user with role permissions + individual permissions from DB
    const userData = await this.prisma.user.findUnique({
      where: { id: user.sub },
      include: {
        role: {
          include: { permissions: true },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!userData || !userData.role) {
      throw new ForbiddenException('User or role configuration not found');
    }

    // Step 6: Merge role permissions + user-level permissions into one set
    const rolePerms = userData.role.permissions.map((p) => p.name);
    const userPerms = userData.userPermissions.map((up) => up.permission.name);
    const allPermissions = new Set([...rolePerms, ...userPerms]);

    // Step 7: Final check — allow if permission exists, otherwise 403
    if (allPermissions.has(requiredPermission)) {
      return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }

  /**
   * deriveResource — Extract resource name from the controller class name.
   * Removes the "Controller" suffix and lowercases the first letter.
   * Examples:
   *   UsersController → "user"
   *   SharingContentController → "sharingcontent"
   *   DashboardController → "dashboard"
   *   RoleController → "role"
   */
  private deriveResource(controllerClass: Function): string {
    const name = controllerClass.name;
    const withoutSuffix = name.replace(/Controller$/i, '');
    return withoutSuffix.toLowerCase();
  }

  /**
   * deriveAction — Determine the CRUD action from HTTP method + route path.
   * 1. Check the last path segment first:
   *    - "update" → "update"
   *    - "delete" → "delete"
   * 2. Otherwise map the HTTP method:
   *    - GET → "read"
   *    - POST → "create"
   *    - PATCH/PUT → "update"
   *    - DELETE → "delete"
   */
  private deriveAction(method: string, path: string): string {
    const segments = path.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1]?.toLowerCase();

    // Check explicit action segments first
    if (lastSegment === 'update') return 'update';
    if (lastSegment === 'delete') return 'delete';

    // Fall back to HTTP method mapping
    const actionMap: Record<string, string> = {
      GET: 'read',
      POST: 'create',
      PATCH: 'update',
      PUT: 'update',
      DELETE: 'delete',
    };

    return actionMap[method] || 'read';
  }

  /**
   * isSelfServiceRoute — Check if the route is a self-service route.
   * Self-service routes contain "me" or "public" in the path.
   * These routes are accessible to any authenticated user without
   * checking specific permissions (e.g., GET /users/me, GET /avatar/me).
   */
  private isSelfServiceRoute(path: string): boolean {
    const segments = path.split('/').filter(Boolean);
    // Routes with /me or /public are self-service
    if (segments.some((s) => s === 'me' || s === 'public')) return true;
    // GET /dashboard/permissions (no userId) — used by frontend to identify the logged-in user
    if (path.endsWith('/dashboard/permissions')) return true;
    return false;
  }
}
