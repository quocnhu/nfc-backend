import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_FULLNAME = 'System Admin';

const permissions = [
  'create:user', 'read:user', 'read:user:all', 'update:user', 'delete:user',
  'create:role', 'read:role', 'update:role', 'delete:role',
  'create:sharingcontent', 'read:sharingcontent', 'read:sharingcontent:all', 'update:sharingcontent', 'delete:sharingcontent',
  'read:history', 'read:history:all',
  'read:dashboard',
  'create:avatar', 'read:avatar', 'delete:avatar',
  'read:upload', 'create:upload', 'delete:upload',
  'read:qr', 'create:qr', 'delete:qr',
  'create:permission', 'read:permission', 'update:permission', 'delete:permission',
  'read:payment', 'create:payment', 'update:payment', 'delete:payment',
];

async function main() {
  console.log('Seeding database...\n');

  const builtInFolders = [
    { name: 'avatars', displayName: 'Avatars (Profile Pictures)', description: 'For user profiles. Max 3MB, 512x512px.', isSystem: true },
    { name: 'icons', displayName: 'Icons (NFC Item Icons)', description: 'For sharing content items. Max 2MB, 256x256px.', isSystem: true },
  ];
  for (const folder of builtInFolders) {
    await prisma.folder.upsert({ where: { name: folder.name }, update: {}, create: folder });
  }
  console.log(`Created ${builtInFolders.length} built-in folders`);

  const createdPermissions: { id: string; name: string }[] = [];
  for (const name of permissions) {
    const perm = await prisma.permission.upsert({ where: { name }, update: {}, create: { name } });
    createdPermissions.push(perm);
  }
  console.log(`Created ${createdPermissions.length} permissions`);

  const adminRole = await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
  await prisma.role.update({
    where: { id: adminRole.id },
    data: { permissions: { set: createdPermissions.map((p) => ({ id: p.id })) } },
  });
  console.log('ADMIN role: ALL permissions');

  const userRole = await prisma.role.upsert({ where: { name: 'USER' }, update: {}, create: { name: 'USER' } });
  const userPermNames = [
    'read:user', 'update:user',
    'create:sharingcontent', 'read:sharingcontent', 'update:sharingcontent',
    'create:avatar', 'read:avatar', 'delete:avatar',
    'read:upload', 'create:upload',
    'read:qr', 'create:qr', 'delete:qr',
  ];
  const userPermissions = createdPermissions.filter((p) => userPermNames.includes(p.name));
  await prisma.role.update({
    where: { id: userRole.id },
    data: { permissions: { set: userPermissions.map((p) => ({ id: p.id })) } },
  });
  console.log('USER role: basic permissions');

  const vipRole = await prisma.role.upsert({ where: { name: 'VIP' }, update: {}, create: { name: 'VIP' } });
  const vipPermNames = [...userPermNames, 'read:history', 'read:dashboard', 'delete:sharingcontent', 'read:user', 'update:user'];
  const vipPermissions = createdPermissions.filter((p) => vipPermNames.includes(p.name));
  await prisma.role.update({
    where: { id: vipRole.id },
    data: { permissions: { set: vipPermissions.map((p) => ({ id: p.id })) } },
  });
  console.log('VIP role: USER perms + history + dashboard + delete sharing');

  const freePlan = await prisma.plan.upsert({
    where: { name: 'FREE' },
    update: {},
    create: { name: 'FREE', displayName: 'Free', description: '30 minutes of NFC access', price: 0, currency: 'USD', durationDays: 0 },
  });

  const proPlan = await prisma.plan.upsert({
    where: { name: 'PRO' },
    update: {},
    create: { name: 'PRO', displayName: 'Pro', description: '1 month of full NFC access', price: 1, currency: 'USD', durationDays: 30 },
  });

  const proPlusPlan = await prisma.plan.upsert({
    where: { name: 'PROPLUS' },
    update: {},
    create: { name: 'PROPLUS', displayName: 'Pro Plus', description: '1 year of full NFC access', price: 2, currency: 'USD', durationDays: 365 },
  });
  console.log('Created 3 plans: Free, Pro, ProPlus');

  const freePlanPermissions = [
    'read:sharingcontent', 'create:sharingcontent', 'update:sharingcontent',
    'read:user', 'update:user',
    'create:avatar', 'read:avatar', 'delete:avatar',
    'read:qr', 'create:qr', 'delete:qr',
  ];

  const proPlanPermissions = [
    ...freePlanPermissions,
    'read:history', 'read:dashboard',
    'read:upload', 'create:upload', 'delete:upload',
    'delete:sharingcontent',
  ];

  const proPlusPlanPermissions = [
    ...proPlanPermissions,
    'read:user:all', 'read:history:all', 'read:sharingcontent:all',
  ];

  const freePermIds = createdPermissions
    .filter((p) => freePlanPermissions.includes(p.name))
    .map((p) => ({ id: p.id }));

  const proPermIds = createdPermissions
    .filter((p) => proPlanPermissions.includes(p.name))
    .map((p) => ({ id: p.id }));

  const proPlusPermIds = createdPermissions
    .filter((p) => proPlusPlanPermissions.includes(p.name))
    .map((p) => ({ id: p.id }));

  await prisma.planPermission.deleteMany({ where: { planId: { in: [freePlan.id, proPlan.id, proPlusPlan.id] } } });
  console.log('Cleared existing plan permissions');

  if (freePermIds.length > 0) {
    await prisma.planPermission.createMany({
      data: freePermIds.map((perm) => ({ planId: freePlan.id, permissionId: perm.id })),
    });
  }

  if (proPermIds.length > 0) {
    await prisma.planPermission.createMany({
      data: proPermIds.map((perm) => ({ planId: proPlan.id, permissionId: perm.id })),
    });
  }

  if (proPlusPermIds.length > 0) {
    await prisma.planPermission.createMany({
      data: proPlusPermIds.map((perm) => ({ planId: proPlusPlan.id, permissionId: perm.id })),
    });
  }

  console.log(`\nPlan permissions assigned:`);
  console.log(`  FREE (${freePermIds.length}): ${freePlanPermissions.join(', ')}`);
  console.log(`  PRO (${proPermIds.length}): ${proPlanPermissions.join(', ')}`);
  console.log(`  PROPLUS (${proPlusPermIds.length}): ${proPlusPlanPermissions.join(', ')}`);

  const hashedAdmin = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminUser = await prisma.user.upsert({ where: { email: ADMIN_EMAIL }, update: {}, create: {
    email: ADMIN_EMAIL, fullname: ADMIN_FULLNAME, password: hashedAdmin, isEmailVerified: true, roleId: adminRole.id, status: 'ACTIVE',
  }});
  console.log(`Admin user: ${adminUser.email}`);

  const hashedDemo = await bcrypt.hash('Demo@123', 10);
  const demoUser = await prisma.user.upsert({ where: { email: 'demo@example.com' }, update: {}, create: {
    email: 'demo@example.com', fullname: 'Demo User', password: hashedDemo, isEmailVerified: true, roleId: userRole.id, status: 'ACTIVE',
  }});
  console.log(`Demo user: ${demoUser.email}`);

  const hashedVip = await bcrypt.hash('Vip@123', 10);
  const vipUser = await prisma.user.upsert({ where: { email: 'vip@example.com' }, update: {}, create: {
    email: 'vip@example.com', fullname: 'VIP User', password: hashedVip, isEmailVerified: true, roleId: vipRole.id, status: 'ACTIVE',
  }});
  console.log(`VIP user: ${vipUser.email}`);

  await prisma.subscription.updateMany({ where: { userId: { in: [demoUser.id, vipUser.id] } }, data: { isCurrent: false } });

  const now = new Date();
  const freeEnd = new Date(now.getTime() + 30 * 60 * 1000);
  const proEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const proPlusEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  await prisma.subscription.create({ data: { userId: demoUser.id, planId: freePlan.id, status: 'TRIAL', startDate: now, endDate: freeEnd, isCurrent: true }});
  await prisma.user.update({ where: { id: demoUser.id }, data: { expiresAt: freeEnd }});

  await prisma.subscription.create({ data: { userId: vipUser.id, planId: proPlusPlan.id, status: 'ACTIVE', startDate: now, endDate: proPlusEnd, isCurrent: true }});
  await prisma.user.update({ where: { id: vipUser.id }, data: { expiresAt: proPlusEnd }});

  console.log('Subscriptions: demo=Free(30min), vip=ProPlus(1yr)');

  await prisma.sharingContent.deleteMany();
  console.log('Cleared existing sharing content');

  const adminSharingItems = [
    { userId: adminUser.id, url: 'https://youtube.com/@quocnhu', itemName: 'YouTube', icon: 'youtube' },
    { userId: adminUser.id, url: 'https://tiktok.com/@quocnhu', itemName: 'TikTok', icon: 'tiktok' },
    { userId: adminUser.id, url: 'mailto:admin@example.com', itemName: 'Email', icon: 'mail' },
    { userId: adminUser.id, url: 'https://linkedin.com/in/quocnhu', itemName: 'LinkedIn', icon: 'linkedin' },
  ];
  for (const item of adminSharingItems) await prisma.sharingContent.create({ data: item });
  console.log(`Admin sharing content: ${adminSharingItems.length} items`);

  const demoSharingItems = [
    { userId: demoUser.id, url: 'https://facebook.com/quocnhu', itemName: 'Facebook', icon: 'facebook' },
    { userId: demoUser.id, url: 'https://instagram.com/quocnhu', itemName: 'Instagram', icon: 'instagram' },
    { userId: demoUser.id, url: 'mailto:demo@example.com', itemName: 'Email', icon: 'mail' },
    { userId: demoUser.id, url: 'tel:+84123456789', itemName: 'Phone', icon: 'phone' },
    { userId: demoUser.id, url: 'https://github.com/quocnhu', itemName: 'GitHub', icon: 'github' },
  ];
  for (const item of demoSharingItems) await prisma.sharingContent.create({ data: item });
  console.log(`Demo user sharing content: ${demoSharingItems.length} items`);

  const vipSharingItems = [
    { userId: vipUser.id, url: 'https://youtube.com/@vipuser', itemName: 'YouTube', icon: 'youtube' },
    { userId: vipUser.id, url: 'https://tiktok.com/@vipuser', itemName: 'TikTok', icon: 'tiktok' },
    { userId: vipUser.id, url: 'https://facebook.com/vipuser', itemName: 'Facebook', icon: 'facebook' },
    { userId: vipUser.id, url: 'https://instagram.com/vipuser', itemName: 'Instagram', icon: 'instagram' },
    { userId: vipUser.id, url: 'https://linkedin.com/in/vipuser', itemName: 'LinkedIn', icon: 'linkedin' },
    { userId: vipUser.id, url: 'mailto:vip@example.com', itemName: 'Email', icon: 'mail' },
    { userId: vipUser.id, url: 'tel:+84987654321', itemName: 'Phone', icon: 'phone' },
  ];
  for (const item of vipSharingItems) await prisma.sharingContent.create({ data: item });
  console.log(`VIP user sharing content: ${vipSharingItems.length} items`);

  console.log('\n--- Seed Complete ---');
  console.log(`ADMIN   : admin@example.com / Admin@123  (id: ${adminUser.id})`);
  console.log(`USER    : demo@example.com  / Demo@123   (id: ${demoUser.id}) — Free plan (30min)`);
  console.log(`VIP     : vip@example.com   / Vip@123    (id: ${vipUser.id}) — ProPlus plan (1yr)`);
  console.log(`\nPlans: Free=$0/30min, Pro=$1/1month, ProPlus=$2/1year`);
  console.log(`\nTest public profile: /public/user?userId=${vipUser.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
