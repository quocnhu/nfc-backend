import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const SALT_ROUNDS = 10;
  const ADMIN_PASSWORD = "Admin@123";

  // ── 1. Permissions ───────────────────────────────────────────────
  const permissionNames = [
    "create:user",
    "read:user",
    "read:user:all",
    "update:user",
    "delete:user",
    "create:role",
    "read:role",
    "update:role",
    "delete:role",
    "create:sharingcontent",
    "read:sharingcontent",
    "read:sharingcontent:all",
    "update:sharingcontent",
    "delete:sharingcontent",
    "read:history",
    "read:history:all",
    "read:dashboard",
    "create:avatar",
    "read:avatar",
    "delete:avatar",
    "read:upload",
    "create:upload",
    "delete:upload",
    "read:qr",
    "create:qr",
    "delete:qr",
    "create:permission",
    "read:permission",
    "update:permission",
    "delete:permission",
    "read:payment",
    "create:payment",
    "update:payment",
    "delete:payment",
    "read:auth",
    "create:auth",
    "read:plan",
    "create:plan",
    "update:plan",
    "delete:plan",
    "read:subscription",
    "create:subscription",
    "update:subscription",
    "delete:subscription",
  ];

  const permissions: Record<string, { id: string }> = {};
  for (const name of permissionNames) {
    const p = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    permissions[name] = p;
  }
  console.log(`  ✔ ${Object.keys(permissions).length} permissions synced`);

  // ── 2. Roles ─────────────────────────────────────────────────────
  const roleSeeds = [
    { name: "ADMIN", permNames: permissionNames },
    { name: "USER", permNames: ["create:user", "read:user", "update:user", "create:role", "read:role", "create:sharingcontent", "read:sharingcontent", "update:sharingcontent", "delete:sharingcontent", "read:history", "read:dashboard", "create:avatar", "read:avatar", "delete:avatar", "read:upload", "create:upload", "delete:upload", "read:qr", "create:qr", "delete:qr"] },
    { name: "VIP", permNames: ["create:user", "read:user", "update:user", "create:role", "read:role", "create:sharingcontent", "read:sharingcontent", "update:sharingcontent", "delete:sharingcontent", "read:history", "read:history:all", "read:dashboard", "create:avatar", "read:avatar", "delete:avatar", "read:upload", "create:upload", "delete:upload", "read:qr", "create:qr", "delete:qr"] },
    { name: "COMPANY", permNames: ["create:user", "read:user", "update:user", "create:role", "read:role", "create:sharingcontent", "read:sharingcontent", "update:sharingcontent", "delete:sharingcontent", "read:history", "read:history:all", "read:dashboard", "create:avatar", "read:avatar", "delete:avatar", "read:upload", "create:upload", "delete:upload", "read:qr", "create:qr", "delete:qr", "delete:upload"] },
    { name: "LOCAL", permNames: permissionNames },
  ];

  const roles: Record<string, { id: string }> = {};
  for (const rs of roleSeeds) {
    const role = await prisma.role.upsert({
      where: { name: rs.name },
      update: {},
      create: { name: rs.name },
    });
    roles[rs.name] = role;

    const uniquePermIds = [...new Set(rs.permNames)];
    await prisma.role.update({
      where: { id: role.id },
      data: {
        permissions: {
          set: uniquePermIds.map((n) => ({ id: permissions[n].id })),
        },
      },
    });
  }
  console.log(`  ✔ ${Object.keys(roles).length} roles synced (with permissions)`);

  // ── 3. Plans ─────────────────────────────────────────────────────
  const planSeeds = [
    {
      name: "FREE",
      displayName: "Free",
      description: "30 minutes of NFC access",
      price: 0,
      currency: "USD",
      durationDays: 0.02083333333333333,
      features: ["access nfc "],
      permNames: ["read:sharingcontent"],
    },
    {
      name: "PRO",
      displayName: "Pro",
      description: "1 month of full NFC access",
      price: 1,
      currency: "USD",
      durationDays: 30,
      features: null,
      permNames: ["read:sharingcontent"],
    },
    {
      name: "PROPLUS",
      displayName: "Pro Plus",
      description: "1 year of full NFC access",
      price: 2,
      currency: "USD",
      durationDays: 365,
      features: null,
      permNames: ["read:sharingcontent"],
    },
    {
      name: "SUPERPLUS",
      displayName: "Super Plus",
      description: null,
      price: 5,
      currency: "USD",
      durationDays: 600,
      features: null,
      permNames: ["read:sharingcontent"],
    },
  ];

  for (const ps of planSeeds) {
    const plan = await prisma.plan.upsert({
      where: { name: ps.name },
      update: {
        displayName: ps.displayName,
        description: ps.description,
        price: ps.price,
        currency: ps.currency,
        durationDays: ps.durationDays,
        features: ps.features as any,
      },
      create: {
        name: ps.name,
        displayName: ps.displayName,
        description: ps.description,
        price: ps.price,
        currency: ps.currency,
        durationDays: ps.durationDays,
        features: ps.features as any,
      },
    });

    const permIds = ps.permNames.map((n) => permissions[n].id);
    // Clear existing then set
    const existing = await prisma.planPermission.findMany({ where: { planId: plan.id } });
    for (const ep of existing) {
      await prisma.planPermission.delete({ where: { id: ep.id } });
    }
    for (const pid of permIds) {
      await prisma.planPermission.create({
        data: { planId: plan.id, permissionId: pid },
      });
    }
  }
  console.log(`  ✔ ${planSeeds.length} plans synced`);

  // ── 4. Admin User ────────────────────────────────────────────────
  const adminHashedPw = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  await prisma.user.upsert({
    where: { email: "admin@example.com" }, 
    update: {},
    create: {
      email: "nquocnhu95it@gmail.com",
      fullname: "System Admin",
      password: adminHashedPw,
      isEmailVerified: true,
      userType: "LOCAL",
      roleId: roles["ADMIN"].id,
      status: "ACTIVE",
    },
  });
  console.log("  ✔ nquocnhu95it@gmail.com user synced (password: Admin@123)");

  // ── 5. Folders ───────────────────────────────────────────────────
  const folderSeeds = [
    {
      name: "avatars",
      displayName: "Avatars (Profile Pictures)",
      description: "For user profiles. Max 3MB, 512x512px.",
      isSystem: true,
    },
    {
      name: "icons",
      displayName: "Icons (NFC Item Icons)",
      description: "For sharing content items. Max 2MB, 256x256px.",
      isSystem: true,
    },
  ];

  for (const fs of folderSeeds) {
    await prisma.folder.upsert({
      where: { name: fs.name },
      update: {},
      create: fs,
    });
  }
  console.log(`  ✔ ${folderSeeds.length} folders synced`);

  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
