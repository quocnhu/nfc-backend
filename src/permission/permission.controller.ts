import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { CreatePermissionDto, UpdatePermissionDto, DeletePermissionDto } from './dto/permission.dto';

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
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionService.create(dto);
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
