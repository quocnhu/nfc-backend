import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from '@/role/dto/role.dto';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';

@Injectable()
export class RoleService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: { select: { id: true, name: true } },
        creator: { select: { id: true, fullname: true, email: true } },
      },
    });
    return responseOk('Roles fetched successfully', roles);
  }

  /**
   * create — Create a new role.
   * Sets createdBy to the admin's userId.
   */
  async create(dto: CreateRoleDto, createdByUserId?: string) {
    // Step 1: Check for duplicate name
    const existing = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Role name already exists');
    }

    // Step 2: Create the role
    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        createdBy: createdByUserId || null,
      },
      include: {
        creator: { select: { id: true, fullname: true, email: true } },
      },
    });

    return responseCreated('Role created successfully', role);
  }

  /**
   * update — Update a role's name and/or assigned permissions.
   * 1. Find role → 404 if not found.
   * 2. Block modification of the ADMIN role → 403.
   * 3. Check name uniqueness if changing → 409 if conflict.
   * 4. Update the role name.
   * 5. If permissionIds provided, replace all permissions (full-replace via `set`).
   * 6. Re-fetch the role with permissions and return.
   */
  async update(id: string, dto: UpdateRoleDto) {
    // Step 1: Find the role
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');

    // Step 2: Block ADMIN role modification
    if (role.name === 'ADMIN') {
      throw new ForbiddenException('ADMIN role cannot be modified');
    }

    // Step 3: Check name uniqueness if changing
    if (dto.name && dto.name !== role.name) {
      const nameTaken = await this.prisma.role.findUnique({
        where: { name: dto.name },
      });
      if (nameTaken) throw new ConflictException('Role name already exists');
    }

    // Step 4: Update the role name
    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
      },
    });

    // Step 5: Replace permissions if provided (full-replace strategy)
    if (dto.permissionIds) {
      await this.prisma.role.update({
        where: { id },
        data: {
          permissions: {
            set: dto.permissionIds.map((pid) => ({ id: pid })),
          },
        },
      });
    }

    // Step 6: Re-fetch with permissions included
    const result = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { select: { id: true, name: true } } },
    });

    return responseOk('Role updated successfully', result);
  }

  /**
   * remove — Delete a role.
   * 1. Find role with its users → 404 if not found.
   * 2. Block deletion of ADMIN role → 403.
   * 3. Block deletion if role is assigned to any users → 403.
   * 4. Delete the role record.
   */
  async remove(id: string) {
    // Step 1: Find the role with its assigned users
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { users: true },
    });

    if (!role) throw new NotFoundException('Role not found');

    // Step 2: Block ADMIN role deletion
    if (role.name === 'ADMIN') {
      throw new ForbiddenException('ADMIN role cannot be deleted');
    }

    // Step 3: Block deletion if role has assigned users
    if (role.users.length > 0) {
      throw new ForbiddenException('Cannot delete role that is assigned to users');
    }

    // Step 4: Delete the role
    await this.prisma.role.delete({ where: { id } });

    return responseOk('Role deleted successfully');
  }
}
