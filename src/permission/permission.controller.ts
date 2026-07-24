import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PermissionService } from '@/permission/permission.service';
import { CreatePermissionDto, UpdatePermissionDto, DeletePermissionDto } from '@/permission/dto/permission.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('permissions')
export class PermissionController {
  constructor(private permissionService: PermissionService) {}

  @Get()
  findAll() {
    return this.permissionService.findAll();
  }

  /**
   * POST /permissions — Create a new permission.
   * Accepts: { name } (e.g. "create:user", "read:dashboard").
   * Throws 409 if permission name already exists.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreatePermissionDto) {
    return this.permissionService.create(dto, userId);
  }

  /**
   * POST /permissions/update — Update a permission's name.
   * Accepts: id (required), name (optional).
   * Throws 404 if not found, 409 if new name is taken.
   */
  @Post('update')
  @HttpCode(HttpStatus.OK)
  update(@Body() dto: UpdatePermissionDto) {
    return this.permissionService.update(dto.id, dto);
  }

  /**
   * POST /permissions/delete — Delete a permission.
   * Cannot delete if assigned to any roles or users.
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  remove(@Body() dto: DeletePermissionDto) {
    return this.permissionService.remove(dto.id);
  }
}
