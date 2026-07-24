import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from '@/user/user.service';
import { CreateUserDto, UpdateUserDto, DeleteUserDto, ChangePasswordDto, AssignPermissionsDto, AdminChangePasswordDto, UnlockUserDto, ToggleStatusDto } from '@/user/dto/user.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/database/prisma/prisma.service';

@Controller('user')
export class UserSelfController {
  constructor(private userService: UserService) {}

  @Get()
  getMe(@CurrentUser('sub') userId: string) {
    return this.userService.getMe(userId);
  }
}

@Controller('users')
export class UserController {
  constructor(
    private userService: UserService,
    private prisma: PrismaService,
  ) {}

  // ─── Self-service routes (any authenticated user can access their own data) ───

  /**
   * GET /users/me — Get the logged-in user's profile.
   * Returns user info including role and individual permissions.
   */
  @Get('me')
  getMe(@CurrentUser('sub') userId: string) {
    return this.userService.getMe(userId);
  }

  /**
   * POST /users/me/update — Update the logged-in user's profile.
   * Accepts optional fields: email, fullname, avatarUrl.
   * The userId comes from the JWT, not from the request body.
   */
  @Post('me/update')
  @HttpCode(HttpStatus.OK)
  updateMe(@CurrentUser('sub') userId: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateMe(userId, dto);
  }

  /**
   * POST /users/me/change-password — Change the logged-in user's password.
   * Requires the current password for verification before allowing the change.
   */
  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  changeMyPassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changeMyPassword(userId, dto);
  }

  // ─── Admin operations (permission checked by RolesGuard automatically) ───

  /**
   * GET /users — List users with pagination and search.
   * Non-admin users (without read:user:all) only see their own record.
   */
  @Get()
  async findAll(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    // Check if user has read:user:all permission
    const hasReadAll = await this.checkUserPermission(userId, 'read:user:all');

    return this.userService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      userId,
      hasReadAll,
    );
  }

  /**
   * POST /users — Create a new user (admin only).
   * Accepts: email, password, fullname, roleId (optional, defaults to USER).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateUserDto) {
    return this.userService.create(dto, userId);
  }

  /**
   * POST /users/update — Update any user (admin only).
   * Accepts: id (required), email, fullname, avatarUrl, roleId (all optional).
   */
  @Post('update')
  @HttpCode(HttpStatus.OK)
  update(@CurrentUser('sub') userId: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(dto.id, dto, userId);
  }

  /**
   * POST /users/assign-permissions — Assign individual permissions to a user (admin only).
   * Replaces all existing user-level permissions with the new set.
   * Accepts: id (userId), permissionIds (array of permission UUIDs).
   */
  @Post('assign-permissions')
  @HttpCode(HttpStatus.OK)
  assignPermissions(@Body() dto: AssignPermissionsDto) {
    return this.userService.assignPermissions(dto.id, dto);
  }

  /**
   * POST /users/admin-change-password — Admin changes a user's password.
   * Accepts: id (userId), newPassword.
   */
  @Post('admin-change-password')
  @HttpCode(HttpStatus.OK)
  adminChangePassword(@Body() dto: AdminChangePasswordDto) {
    return this.userService.adminChangePassword(dto.id, dto.newPassword);
  }

  /**
   * POST /users/delete — Delete a user (admin only).
   * Cannot delete yourself or ADMIN users. Accepts: id (userId).
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser('sub') userId: string, @Body() dto: DeleteUserDto) {
    return this.userService.remove(dto.id, userId);
  }

  /**
   * POST /users/unlock — Unlock a locked user account (admin only).
   * Resets failedLoginCount and lockedUntil to null.
   */
  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  unlock(@CurrentUser('sub') userId: string, @Body() dto: UnlockUserDto) {
    return this.userService.unlock(dto.id, userId);
  }

  /**
   * POST /users/verify-email — Admin manually verifies a user's email (admin only).
   * Sets isEmailVerified to true and removes pending verification tokens.
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: { id: string }) {
    return this.userService.verifyEmail(dto.id);
  }

  @Post('toggle-status')
  @HttpCode(HttpStatus.OK)
  toggleStatus(@Body() dto: ToggleStatusDto) {
    return this.userService.toggleStatus(dto.id);
  }

  /**
   * Check if a user has a specific permission (from role or individual).
   */
  private async checkUserPermission(userId: string, permissionName: string): Promise<boolean> {
    const userData = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        userPermissions: { include: { permission: true } },
      },
    });

    if (!userData) return false;

    const rolePerms = userData.role.permissions.map((p) => p.name);
    const userPerms = userData.userPermissions.map((up) => up.permission.name);
    const allPermissions = new Set([...rolePerms, ...userPerms]);

    return allPermissions.has(permissionName);
  }
}
