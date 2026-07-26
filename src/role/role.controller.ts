import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { RoleService } from '@/role/role.service';
import { CreateRoleDto, UpdateRoleDto, DeleteRoleDto } from '@/role/dto/role.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('roles')
export class RoleController {
  constructor(private roleService: RoleService) {}

  @Get()
  findAll() {
    return this.roleService.findAll();
  }

  /**
   * POST /roles — Create a new role.
   * Accepts: { name } (e.g. "MANAGER", "EDITOR").
   * Throws 409 if role name already exists.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateRoleDto) {
    return this.roleService.create(dto, userId);
  }

  /**
   * POST /roles/update — Update a role's name and/or permissions.
   * Accepts: id (required), name (optional), permissionIds (optional array).
   * ADMIN role cannot be modified.
   * If permissionIds is provided, replaces all role permissions (full-replace).
   */
  @Post('update')
  @HttpCode(HttpStatus.OK)
  update(@Body() dto: UpdateRoleDto) {
    return this.roleService.update(dto.id, dto);
  }

  /**
   * POST /roles/delete — Delete a role.
   * Cannot delete the ADMIN role.
   * Cannot delete a role that is assigned to any users.
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  remove(@Body() dto: DeleteRoleDto) {
    return this.roleService.remove(dto.id);
  }

  /**
   * POST /roles/bulk-delete — Delete multiple roles (admin only).
   * Cannot delete the ADMIN role.
   * Cannot delete roles that are assigned to any users.
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  bulkRemove(@Body() dto: { ids: string[] }) {
    return this.roleService.bulkDelete(dto.ids);
  }
}
