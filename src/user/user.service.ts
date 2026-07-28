import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, AssignPermissionsDto } from '@/user/dto/user.dto';
import * as bcrypt from 'bcrypt';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  /**
   * findAll — Get a paginated list of users with optional search.
   * If hasReadAll is false, returns only the current user's record.
   */
  async findAll(page: number = 1, limit: number = 20, search?: string, currentUserId?: string, hasReadAll: boolean = false) {
    const skip = (page - 1) * limit;

    // If user doesn't have read:user:all, filter to only their own record
    const baseWhere = !hasReadAll && currentUserId
      ? { id: currentUserId }
      : {};

    const searchWhere = search
      ? {
          OR: [
            { fullname: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const where = { ...baseWhere, ...searchWhere };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          fullname: true,
          avatarUrl: true,
          isEmailVerified: true,
          roleId: true,
          role: { select: { id: true, name: true } },
          creator: { select: { id: true, fullname: true, email: true } },
          failedLoginCount: true,
          lockedUntil: true,
          status: true,
          expiresAt: true,
          subscriptions: {
            where: { isCurrent: true },
            take: 1,
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { email: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return responseOk('Users fetched successfully', {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  /**
   * getMe — Get the logged-in user's full profile.
   * Returns user info including role name and individual permissions.
   * Throws 404 if user not found.
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullname: true,
        avatarUrl: true,
        isEmailVerified: true,
        roleId: true,
        role: { select: { id: true, name: true } },
        userPermissions: {
          include: { permission: { select: { id: true, name: true } } },
        },
        status: true,
        expiresAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return responseOk('Profile fetched successfully', user);
  }

  /**
   * updateMe — Update the logged-in user's own profile.
   * 1. Check user exists → 404 if not.
   * 2. If email is changing, check it's not taken by another user → 409 if conflict.
   * 3. Update the user record with the provided fields.
   */
  async updateMe(userId: string, dto: UpdateUserDto) {
    // Step 1: Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Step 2: Check email uniqueness if changing
    if (dto.email && dto.email !== user.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailTaken) throw new ConflictException('Email already in use');
    }

    // Step 3: Update the profile
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: dto.email,
        fullname: dto.fullname,
        avatarUrl: dto.avatarUrl,
      },
      select: {
        id: true,
        email: true,
        fullname: true,
        avatarUrl: true,
        isEmailVerified: true,
        role: { select: { id: true, name: true } },
        status: true,
        expiresAt: true,
      },
    });

    return responseOk('Profile updated successfully', updated);
  }

  /**
   * changeMyPassword — Change the logged-in user's password.
   * 1. Verify user exists → 404 if not.
   * 2. Compare current password with stored bcrypt hash → 403 if wrong.
   * 3. Hash the new password and update the record.
   */
  async changeMyPassword(userId: string, dto: ChangePasswordDto) {
    // Step 1: Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Step 2: Verify the current password is correct
    const pwMatches = await bcrypt.compare(dto.currentPassword, user.password);
    if (!pwMatches) {
      throw new ForbiddenException('Current password is incorrect');
    }

    // Step 3: Hash and save the new password
    const hash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return responseOk('Password changed successfully');
  }

  /**
   * create — Create a new user (admin operation).
   * Sets createdBy to the admin's userId.
   * If creating an ADMIN user: auto-verify email and set status to ACTIVE.
   * For other roles: require email verification (isEmailVerified: false, status: INACTIVE).
   */
  async create(dto: CreateUserDto, createdByUserId?: string) {
    // Step 1: Check for existing user with same email
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    // Step 2: Hash the password
    const hash = await bcrypt.hash(dto.password, 10);

    // Step 3: Determine role and verification status
    let isAdminRole = false;
    const createData: any = {
      email: dto.email,
      password: hash,
      fullname: dto.fullname,
      avatarUrl: dto.avatarUrl,
      createdBy: createdByUserId || null,
    };

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      isAdminRole = role?.name.toUpperCase() === 'ADMIN';
      
      // Only allow assigning ADMIN role if creator is also an admin
      if (isAdminRole && createdByUserId) {
        const creator = await this.prisma.user.findUnique({
          where: { id: createdByUserId },
          include: { role: true },
        });
        if (creator?.role.name.toUpperCase() !== 'ADMIN') {
          throw new ForbiddenException('Only admins can create admin users');
        }
      }
      
      createData.roleId = dto.roleId;
    } else {
      createData.role = { connect: { name: 'USER' } };
    }

    // Step 4: Set verification and status based on who created the user
    // If created by admin, skip verification and set as active
    if (createdByUserId) {
      createData.isEmailVerified = true;
      createData.status = 'ACTIVE';
    } else {
      // Self-registered users need verification
      createData.isEmailVerified = false;
      createData.status = 'INACTIVE';
    }

    // Step 5: Create the user in DB
    const user = await this.prisma.user.create({
      data: createData,
      select: {
        id: true,
        email: true,
        fullname: true,
        avatarUrl: true,
        isEmailVerified: true,
        role: { select: { id: true, name: true } },
        creator: { select: { id: true, fullname: true, email: true } },
        status: true,
        expiresAt: true,
      },
    });

    return responseCreated('User created successfully', user);
  }

  /**
   * update — Update any user by ID (admin or self via update:user permission).
   * Supports optional newPassword field to change password during update.
   */
  async update(id: string, dto: UpdateUserDto, currentUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const isTargetAdmin = user.role.name.toUpperCase() === 'ADMIN';
    const isSelfUpdate = currentUserId && currentUserId === id;

    if (isTargetAdmin && !isSelfUpdate) {
      throw new ForbiddenException('Cannot update other admin users');
    }

    if (isTargetAdmin && dto.roleId) {
      throw new ForbiddenException('Cannot change admin role');
    }

    // Check if trying to assign ADMIN role - only admins can do this
    if (dto.roleId && currentUserId) {
      const newRole = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (newRole?.name.toUpperCase() === 'ADMIN') {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: currentUserId },
          include: { role: true },
        });
        if (currentUser?.role.name.toUpperCase() !== 'ADMIN') {
          throw new ForbiddenException('Only admins can assign admin role');
        }
      }
    }

    if (dto.email && dto.email !== user.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailTaken) throw new ConflictException('Email already in use');
    }

    const updateData: any = {
      fullname: dto.fullname,
      avatarUrl: dto.avatarUrl,
      roleId: dto.roleId,
    };

    if (dto.email) updateData.email = dto.email;
    if (dto.isEmailVerified !== undefined) updateData.isEmailVerified = dto.isEmailVerified;
    if (dto.expiresAt !== undefined) {
      updateData.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    if (dto.newPassword) {
      updateData.password = await bcrypt.hash(dto.newPassword, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullname: true,
        avatarUrl: true,
        isEmailVerified: true,
        status: true,
        expiresAt: true,
        role: { select: { id: true, name: true } },
      },
    });

    return responseOk('User updated successfully', updated);
  }

  /**
   * assignPermissions — Replace a user's individual permissions (admin operation).
   * 1. Verify user exists → 404 if not.
   * 2. Check if user is ADMIN and not self → 403 (cannot modify other admin permissions).
   * 3. Delete all existing UserPermission records for this user.
   * 4. Bulk-insert the new set of permissions.
   * This is a full-replace strategy (not additive).
   */
  async assignPermissions(userId: string, dto: AssignPermissionsDto, currentUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const isTargetAdmin = user.role.name.toUpperCase() === 'ADMIN';
    const isSelfUpdate = currentUserId && currentUserId === userId;

    if (isTargetAdmin && !isSelfUpdate) {
      throw new ForbiddenException('Cannot assign permissions to other admin users');
    }

    await this.prisma.userPermission.deleteMany({ where: { userId } });

    if (dto.permissionIds.length > 0) {
      await this.prisma.userPermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({
          userId,
          permissionId,
        })),
      });
    }

    return responseOk('Permissions assigned successfully');
  }

  /**
   * remove — Delete a user by ID (admin operation).
   * Cannot delete yourself or ADMIN users.
   */
  async remove(id: string, currentUserId?: string) {
    // Block self-deletion
    if (currentUserId && id === currentUserId) {
      throw new ForbiddenException('Cannot delete yourself');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.role.name.toUpperCase() === 'ADMIN') {
      throw new ForbiddenException('Admin users cannot be deleted');
    }

    await this.prisma.user.delete({ where: { id } });
    return responseOk('User deleted successfully');
  }

  async bulkDelete(ids: string[], currentUserId?: string) {
    if (!ids.length) throw new NotFoundException('No IDs provided');

    if (currentUserId && ids.includes(currentUserId)) {
      throw new ForbiddenException('Cannot delete yourself');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      include: { role: true },
    });

    const adminUsers = users.filter(u => u.role.name.toUpperCase() === 'ADMIN');
    if (adminUsers.length) {
      throw new ForbiddenException('Admin users cannot be deleted');
    }

    await this.prisma.user.deleteMany({ where: { id: { in: ids } } });
    return responseOk(`${ids.length} user(s) deleted successfully`);
  }

  /**
   * adminChangePassword — Admin changes a user's password directly.
   */
  async adminChangePassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role.name.toUpperCase() === 'ADMIN') {
      throw new ForbiddenException('Cannot change password for admin users');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return responseOk('Password changed successfully');
  }

  /**
   * unlock — Admin unlocks a locked user account.
   * Resets failedLoginCount to 0 and lockedUntil to null.
   */
  async unlock(id: string, performedByUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role.name.toUpperCase() === 'ADMIN') {
      throw new ForbiddenException('Cannot unlock admin users');
    }

    if (!user.lockedUntil) {
      return responseOk('Account is not locked');
    }

    await this.prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    return responseOk('Account unlocked successfully');
  }

  /**
   * verifyEmail — Admin manually verifies a user's email.
   * Sets isEmailVerified to true and removes any pending verification tokens.
   */
  async verifyEmail(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.isEmailVerified) {
      return responseOk('Email is already verified');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isEmailVerified: true },
    });

    await this.prisma.emailVerification.deleteMany({ where: { email: user.email } });

    return responseOk('Email verified successfully');
  }

  async toggleStatus(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: user.roleId } });
      if (role?.name.toUpperCase() === 'ADMIN') {
        throw new ForbiddenException('Admin status cannot be changed');
      }
    }

    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updateData: any = { status: newStatus };

    if (newStatus === 'ACTIVE') {
      updateData.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullname: true,
        status: true,
        expiresAt: true,
        role: { select: { id: true, name: true } },
      },
    });

    return responseOk(`User status changed to ${newStatus}`, updated);
  }
}
