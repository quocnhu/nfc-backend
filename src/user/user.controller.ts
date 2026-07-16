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
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, DeleteUserDto, ChangePasswordDto, AssignPermissionsDto, AdminChangePasswordDto } from './dto/user.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  constructor(private userService: UserService) {}

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
   * GET /users — List all users with pagination and search.
   * Query params: ?page=1&limit=20&search=john
   * Returns paginated user list with total count and total pages.
   */
  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.userService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
    );
  }

  /**
   * POST /users — Create a new user (admin only).
   * Accepts: email, password, fullname, roleId (optional, defaults to USER).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  /**
   * POST /users/update — Update any user (admin only).
   * Accepts: id (required), email, fullname, avatarUrl, roleId (all optional).
   */
  @Post('update')
  @HttpCode(HttpStatus.OK)
  update(@Body() dto: UpdateUserDto) {
    return this.userService.update(dto.id, dto);
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
   * Cannot delete ADMIN users. Accepts: id (userId).
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  remove(@Body() dto: DeleteUserDto) {
    return this.userService.remove(dto.id);
  }
}
