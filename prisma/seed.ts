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
  'read:user:all',
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
  'read:sharingcontent:all',
  'update:sharingcontent',
  'delete:sharingcontent',
  // History
  'read:history',
  'read:history:all',
  // Dashboard
  'read:dashboard',
  // Avatar
  'create:avatar',
  'read:avatar',
  'delete:avatar',
  // Upload
  'read:upload',
  'create:upload',
  'delete:upload',
  // QR
  'read:qr',
  'create:qr',
  'delete:qr',
  // Permission management
  'create:permission',
  'read:permission',
  'update:permission',
  'delete:permission',
];

async function main() {
  console.log('Seeding database...\n');

  // 0. Create built-in upload folders
  const builtInFolders = [
    { name: 'avatars', displayName: 'Avatars (Profile Pictures)', description: 'For user profiles. Max 3MB, 512x512px.', isSystem: true },
    { name: 'icons', displayName: 'Icons (NFC Item Icons)', description: 'For sharing content items. Max 2MB, 256x256px.', isSystem: true },
  ];
  for (const folder of builtInFolders) {
    await prisma.folder.upsert({
      where: { name: folder.name },
      update: {},
      create: folder,
    });
  }
  console.log(`Created ${builtInFolders.length} built-in folders`);

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
    'read:upload',
    'create:upload',
    'read:qr',
    'create:qr',
    'delete:qr',
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

  // 8. Clear old sharing content and re-seed
  await prisma.sharingContent.deleteMany();
  console.log('Cleared existing sharing content');

  const adminSharingItems = [
    { userId: adminUser.id, url: 'https://youtube.com/@quocnhu', itemName: 'YouTube', icon: 'youtube' },
    { userId: adminUser.id, url: 'https://tiktok.com/@quocnhu', itemName: 'TikTok', icon: 'tiktok' },
    { userId: adminUser.id, url: 'mailto:admin@example.com', itemName: 'Email', icon: 'mail' },
    { userId: adminUser.id, url: 'https://linkedin.com/in/quocnhu', itemName: 'LinkedIn', icon: 'linkedin' },
  ];

  for (const item of adminSharingItems) {
    await prisma.sharingContent.create({ data: item });
  }
  console.log(`Admin sharing content: ${adminSharingItems.length} items`);

  // 9. Demo user sharing content (USER role — gets UserTemplate)
  const demoSharingItems = [
    { userId: demoUser.id, url: 'https://facebook.com/quocnhu', itemName: 'Facebook', icon: 'facebook' },
    { userId: demoUser.id, url: 'https://instagram.com/quocnhu', itemName: 'Instagram', icon: 'instagram' },
    { userId: demoUser.id, url: 'mailto:demo@example.com', itemName: 'Email', icon: 'mail' },
    { userId: demoUser.id, url: 'tel:+84123456789', itemName: 'Phone', icon: 'phone' },
    { userId: demoUser.id, url: 'https://github.com/quocnhu', itemName: 'GitHub', icon: 'github' },
  ];

  for (const item of demoSharingItems) {
    await prisma.sharingContent.create({ data: item });
  }
  console.log(`Demo user sharing content: ${demoSharingItems.length} items`);

  // 10. VIP user sharing content (VIP role — gets VipTemplate)
  const vipSharingItems = [
    { userId: vipUser.id, url: 'https://youtube.com/@vipuser', itemName: 'YouTube', icon: 'youtube' },
    { userId: vipUser.id, url: 'https://tiktok.com/@vipuser', itemName: 'TikTok', icon: 'tiktok' },
    { userId: vipUser.id, url: 'https://facebook.com/vipuser', itemName: 'Facebook', icon: 'facebook' },
    { userId: vipUser.id, url: 'https://instagram.com/vipuser', itemName: 'Instagram', icon: 'instagram' },
    { userId: vipUser.id, url: 'https://linkedin.com/in/vipuser', itemName: 'LinkedIn', icon: 'linkedin' },
    { userId: vipUser.id, url: 'mailto:vip@example.com', itemName: 'Email', icon: 'mail' },
    { userId: vipUser.id, url: 'tel:+84987654321', itemName: 'Phone', icon: 'phone' },
  ];

  for (const item of vipSharingItems) {
    await prisma.sharingContent.create({ data: item });
  }
  console.log(`VIP user sharing content: ${vipSharingItems.length} items`);

  console.log('\n--- Seed Complete ---');
  console.log(`ADMIN : admin@example.com / Admin@123  (id: ${adminUser.id})`);
  console.log(`USER  : demo@example.com  / Demo@123   (id: ${demoUser.id})`);
  console.log(`VIP   : vip@example.com   / Vip@123    (id: ${vipUser.id})`);
  console.log(`\nTest public profile: /public/user?userId=${adminUser.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
