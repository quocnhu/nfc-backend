import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, AssignPermissionsDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { responseOk, responseCreated } from '../common/helpers/response.helper';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  /**
   * findAll — Get a paginated list of all users with optional search.
   * 1. Calculate skip offset from page number.
   * 2. Build a search filter (case-insensitive match on fullname or email).
   * 3. Query users and total count in parallel for pagination.
   * 4. Return users with pagination metadata (total, page, limit, totalPages).
   */
  async findAll(page: number = 1, limit: number = 20, search?: string) {
    // Step 1: Calculate how many records to skip
    const skip = (page - 1) * limit;

    // Step 2: Build search filter — case-insensitive partial match
    const where = search
      ? {
          OR: [
            { fullname: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Step 3: Fetch users and total count in parallel
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
        },
        orderBy: { email: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Step 4: Return paginated results
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
   * 1. Check email uniqueness → 409 if duplicate.
   * 2. Hash the password with bcrypt.
   * 3. If roleId is provided, assign that role. Otherwise default to "USER".
   * 4. Create the user and return the result (password excluded from response).
   */
  async create(dto: CreateUserDto) {
    // Step 1: Check for existing user with same email
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    // Step 2: Hash the password
    const hash = await bcrypt.hash(dto.password, 10);

    // Step 3: Prepare user data with optional role assignment
    const createData: any = {
      email: dto.email,
      password: hash,
      fullname: dto.fullname,
      avatarUrl: dto.avatarUrl,
    };

    if (dto.roleId) {
      createData.roleId = dto.roleId;
    } else {
      createData.role = { connect: { name: 'USER' } };
    }

    // Step 4: Create the user in DB
    const user = await this.prisma.user.create({
      data: createData,
      select: {
        id: true,
        email: true,
        fullname: true,
        avatarUrl: true,
        isEmailVerified: true,
        role: { select: { id: true, name: true } },
      },
    });

    return responseCreated('User created successfully', user);
  }

  /**
   * update — Update any user by ID (admin operation).
   * 1. Verify user exists → 404 if not.
   * 2. Check email uniqueness if changing → 409 if conflict.
   * 3. Update user record with provided fields including roleId.
   */
  async update(id: string, dto: UpdateUserDto) {
    // Step 1: Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Step 2: Check email uniqueness if changing
    if (dto.email && dto.email !== user.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailTaken) throw new ConflictException('Email already in use');
    }

    // Step 3: Update the user
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        fullname: dto.fullname,
        avatarUrl: dto.avatarUrl,
        roleId: dto.roleId,
      },
      select: {
        id: true,
        email: true,
        fullname: true,
        avatarUrl: true,
        isEmailVerified: true,
        role: { select: { id: true, name: true } },
      },
    });

    return responseOk('User updated successfully', updated);
  }

  /**
   * assignPermissions — Replace a user's individual permissions (admin operation).
   * 1. Verify user exists → 404 if not.
   * 2. Delete all existing UserPermission records for this user.
   * 3. Bulk-insert the new set of permissions.
   * This is a full-replace strategy (not additive).
   */
  async assignPermissions(userId: string, dto: AssignPermissionsDto) {
    // Step 1: Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Step 2: Remove all existing individual permissions for this user
    await this.prisma.userPermission.deleteMany({ where: { userId } });

    // Step 3: Insert the new set of permissions
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
   */
  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.role.name === 'ADMIN') {
      throw new ForbiddenException('Admin users cannot be deleted');
    }

    await this.prisma.user.delete({ where: { id } });
    return responseOk('User deleted successfully');
  }

  /**
   * adminChangePassword — Admin changes a user's password directly.
   */
  async adminChangePassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return responseOk('Password changed successfully');
  }
}
