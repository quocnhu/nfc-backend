import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Admin credentials for testing via Postman
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin@123'; // Change this in production!
const ADMIN_FULLNAME = 'System Admin';

const permissions = [
  // User management
  'create:user',
  'read:user',
  'update:user',
  'delete:user',
  // Role management
  'create:role',
  'read:role',
  'update:role',
  'delete:role',
  // Sharing content
  'create:sharingcontent',
  'read:sharingcontent',
  'update:sharingcontent',
  'delete:sharingcontent',
  // History
  'read:history',
  // Dashboard
  'read:dashboard',
  // Avatar
  'create:avatar',
  'read:avatar',
  'delete:avatar',
  // Permission management
  'create:permission',
  'read:permission',
  'update:permission',
  'delete:permission',
];

async function main() {
  console.log('Seeding database...\n');

  // 1. Create permissions
  const createdPermissions: { id: string; name: string }[] = [];
  for (const name of permissions) {
    const perm = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    createdPermissions.push(perm);
  }
  console.log(`Created ${createdPermissions.length} permissions`);

  // 2. ADMIN role — ALL permissions
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });

  await prisma.role.update({
    where: { id: adminRole.id },
    data: {
      permissions: {
        set: createdPermissions.map((p) => ({ id: p.id })),
      },
    },
  });
  console.log('ADMIN role: ALL permissions');

  // 3. USER role — basic permissions
  const userRole = await prisma.role.upsert({
    where: { name: 'USER' },
    update: {},
    create: { name: 'USER' },
  });

  const userPermNames = [
    'read:user',
    'update:user',
    'create:sharingcontent',
    'read:sharingcontent',
    'update:sharingcontent',
    'create:avatar',
    'read:avatar',
    'delete:avatar',
  ];

  const userPermissions = createdPermissions.filter((p) =>
    userPermNames.includes(p.name),
  );

  await prisma.role.update({
    where: { id: userRole.id },
    data: {
      permissions: {
        set: userPermissions.map((p) => ({ id: p.id })),
      },
    },
  });
  console.log('USER role: read/update own profile, CRUD sharing, avatar');

  // 4. VIP role — USER perms + history, dashboard, delete:sharingcontent
  const vipRole = await prisma.role.upsert({
    where: { name: 'VIP' },
    update: {},
    create: { name: 'VIP' },
  });

  const vipPermNames = [
    ...userPermNames,
    'read:history',
    'read:dashboard',
    'delete:sharingcontent',
    'read:user',
    'update:user',
  ];

  const vipPermissions = createdPermissions.filter((p) =>
    vipPermNames.includes(p.name),
  );

  await prisma.role.update({
    where: { id: vipRole.id },
    data: {
      permissions: {
        set: vipPermissions.map((p) => ({ id: p.id })),
      },
    },
  });
  console.log('VIP role: USER perms + history + dashboard + delete sharing');

  // 5. Admin user
  const hashedAdmin = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      fullname: ADMIN_FULLNAME,
      password: hashedAdmin,
      isEmailVerified: true,
      roleId: adminRole.id,
    },
  });
  console.log(`Admin user: ${adminUser.email}`);

  // 6. Demo user (USER role)
  const hashedDemo = await bcrypt.hash('Demo@123', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      fullname: 'Demo User',
      password: hashedDemo,
      isEmailVerified: true,
      roleId: userRole.id,
    },
  });
  console.log(`Demo user: ${demoUser.email}`);

  // 7. VIP user
  const hashedVip = await bcrypt.hash('Vip@123', 10);
  const vipUser = await prisma.user.upsert({
    where: { email: 'vip@example.com' },
    update: {},
    create: {
      email: 'vip@example.com',
      fullname: 'VIP User',
      password: hashedVip,
      isEmailVerified: true,
      roleId: vipRole.id,
    },
  });
  console.log(`VIP user: ${vipUser.email}`);

  // 8. Admin sharing content (YouTube + TikTok) — for testing public NFC endpoint
  const adminSharingItems = [
    {
      userId: adminUser.id,
      url: 'https://youtube.com/@quocnhu',
      itemName: 'YouTube',
      icon: 'youtube',
    },
    {
      userId: adminUser.id,
      url: 'https://tiktok.com/@quocnhu',
      itemName: 'TikTok',
      icon: 'tiktok',
    },
  ];

  for (const item of adminSharingItems) {
    await prisma.sharingContent.create({ data: item });
  }
  console.log(`Admin sharing content: ${adminSharingItems.length} items (YouTube, TikTok)`);
  console.log(`  → Test with: POST /sharing-content/public/user { "userId": "${adminUser.id}" }`);

  // 9. Demo user sharing content
  await prisma.sharingContent.create({
    data: {
      userId: demoUser.id,
      url: 'https://example.com/shared-item',
      itemName: 'Welcome Post',
      icon: 'star',
    },
  });
  console.log('Demo sharing content created');

  console.log('\n--- Seed Complete ---');
  console.log(`ADMIN : admin@example.com / Admin@123`);
  console.log(`USER  : demo@example.com / Demo@123`);
  console.log(`VIP   : vip@example.com / Vip@123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
