import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { CreatePermissionDto, UpdatePermissionDto } from '@/permission/dto/permission.dto';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';

@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const permissions = await this.prisma.permission.findMany({
      include: {
        creator: { select: { id: true, fullname: true, email: true } },
      },
    });
    return responseOk('Permissions fetched successfully', permissions);
  }

  /**
   * create — Create a new permission.
   * Sets createdBy to the admin's userId.
   */
  async create(dto: CreatePermissionDto, createdByUserId?: string) {
    // Step 1: Check for duplicate name
    const existing = await this.prisma.permission.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Permission name already exists');
    }

    // Step 2: Create the permission
    const permission = await this.prisma.permission.create({
      data: {
        name: dto.name,
        createdBy: createdByUserId || null,
      },
      include: {
        creator: { select: { id: true, fullname: true, email: true } },
      },
    });

    return responseCreated('Permission created successfully', permission);
  }

  /**
   * update — Update a permission's name.
   * 1. Find permission → 404 if not found.
   * 2. Check name uniqueness if changing → 409 if conflict.
   * 3. Update the permission record.
   */
  async update(id: string, dto: UpdatePermissionDto) {
    // Step 1: Find the permission
    const permission = await this.prisma.permission.findUnique({ where: { id } });
    if (!permission) throw new NotFoundException('Permission not found');

    // Step 2: Check name uniqueness if changing
    if (dto.name && dto.name !== permission.name) {
      const nameTaken = await this.prisma.permission.findUnique({
        where: { name: dto.name },
      });
      if (nameTaken) throw new ConflictException('Permission name already exists');
    }

    // Step 3: Update the permission
    const updated = await this.prisma.permission.update({
      where: { id },
      data: { name: dto.name },
    });

    return responseOk('Permission updated successfully', updated);
  }

  /**
   * remove — Delete a permission.
   * 1. Find permission with its role and userPermission relations → 404 if not found.
   * 2. Block deletion if assigned to any roles → 403.
   * 3. Block deletion if assigned to any users via UserPermission → 403.
   * 4. Delete the permission record.
   */
  async remove(id: string) {
    // Step 1: Find the permission with its relations
    const permission = await this.prisma.permission.findUnique({
      where: { id },
      include: { roles: true, userPermissions: true },
    });

    if (!permission) throw new NotFoundException('Permission not found');

    // Step 2: Block if assigned to roles
    if (permission.roles.length > 0) {
      throw new ForbiddenException('Cannot delete permission that is assigned to roles');
    }

    // Step 3: Block if assigned to users
    if (permission.userPermissions.length > 0) {
      throw new ForbiddenException('Cannot delete permission that is assigned to users');
    }

    // Step 4: Delete the permission
    await this.prisma.permission.delete({ where: { id } });

    return responseOk('Permission deleted successfully');
  }
}
