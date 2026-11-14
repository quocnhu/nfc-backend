import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const SALT_ROUNDS = 10;
  const ADMIN_PASSWORD =
    process.env.SEED_ADMIN_PASSWORD ||
    (process.env.NODE_ENV !== "production" ? "Admin@123" : undefined);
  if (!ADMIN_PASSWORD) {
    throw new Error("SEED_ADMIN_PASSWORD must be set in production");
  }

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
    "read:translation",
    "create:translation",
    "update:translation",
    "delete:translation",
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
    "read:sharedbox",
    "create:sharedbox",
    "delete:sharedbox",
    "*:sharedbox",
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
    { name: "USER", permNames: ["create:user", "read:user", "update:user", "create:role", "read:role", "create:sharingcontent", "read:sharingcontent", "update:sharingcontent", "delete:sharingcontent", "read:history", "read:translation", "create:translation", "update:translation", "delete:translation", "read:dashboard", "create:avatar", "read:avatar", "delete:avatar", "read:upload", "create:upload", "delete:upload", "read:qr", "create:qr", "delete:qr", "read:sharedbox", "create:sharedbox", "delete:sharedbox", "*:sharedbox"] },
    { name: "VIP", permNames: ["create:user", "read:user", "update:user", "create:role", "read:role", "create:sharingcontent", "read:sharingcontent", "update:sharingcontent", "delete:sharingcontent", "read:history", "read:history:all", "read:translation", "create:translation", "update:translation", "delete:translation", "read:dashboard", "create:avatar", "read:avatar", "delete:avatar", "read:upload", "create:upload", "delete:upload", "read:qr", "create:qr", "delete:qr", "read:sharedbox", "create:sharedbox", "delete:sharedbox", "*:sharedbox"] },
    { name: "COMPANY", permNames: ["create:user", "read:user", "update:user", "create:role", "read:role", "create:sharingcontent", "read:sharingcontent", "update:sharingcontent", "delete:sharingcontent", "read:history", "read:history:all", "read:translation", "create:translation", "update:translation", "delete:translation", "read:dashboard", "create:avatar", "read:avatar", "delete:avatar", "read:upload", "create:upload", "delete:upload", "read:qr", "create:qr", "delete:qr", "delete:upload", "read:sharedbox", "create:sharedbox", "delete:sharedbox", "*:sharedbox"] },
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

  // ── 3. Templates ─────────────────────────────────────────────────
  // The catalog of NFC profile templates. `componentKey` maps to the React
  // renderer on the frontend. Add new rows here as templates are created.
  const templateSeeds = [
    {
      slug: "vip",
      name: "VIP",
      category: "General",
      description: "Animated VIP profile card",
      componentKey: "VipTemplate",
      sortOrder: 1,
    },
    {
      slug: "classic",
      name: "Classic",
      category: "General",
      description: "Classic profile card",
      componentKey: "UserTemplate",
      sortOrder: 2,
    },
    {
      slug: "real-estate",
      name: "Real Estate",
      category: "Real Estate",
      description: "3D real estate advisor card",
      componentKey: "RealEstateTemplate",
      sortOrder: 3,
    },
    {
      slug: "accounting",
      name: "Accounting",
      category: "Accounting",
      description: "3D accounting & tax advisor card",
      componentKey: "AccountingTemplate",
      sortOrder: 4,
    },
    {
      slug: "logistics",
      name: "Logistics",
      category: "Logistics",
      description: "3D transport & logistics advisor card",
      componentKey: "LogisticsTemplate",
      sortOrder: 5,
    },
    {
      slug: "it-devops",
      name: "IT & Tourism",
      category: "IT & Tourism",
      description: "3D tour guide & IT DevOps card with mode switch",
      componentKey: "ItDevopsTemplate",
      sortOrder: 6,
    },
    {
      slug: "speaker",
      name: "Speaker & Entrepreneur",
      category: "Speaking",
      description: "3D speaker & entrepreneur card with animated stage",
      componentKey: "SpeakerTemplate",
      sortOrder: 7,
    },
    {
      slug: "tour-guide",
      name: "Tour Guide",
      category: "Tourism",
      description: "3D tour guide card with Vietnam map and tourist group",
      componentKey: "TourGuideTemplate",
      sortOrder: 8,
    },
    {
      slug: "it-devops-engineer",
      name: "IT DevOps Engineer",
      category: "IT",
      description: "3D IT DevOps engineer card with robot, servers and cloud",
      componentKey: "ItTemplate",
      sortOrder: 9,
    },
  ];

  const templates: Record<string, { id: string }> = {};
  for (const ts of templateSeeds) {
    const t = await prisma.template.upsert({
      where: { slug: ts.slug },
      update: ts,
      create: ts,
    });
    templates[ts.slug] = t;
  }
  console.log(`  ✔ ${templateSeeds.length} templates synced`);

  // Which templates each role may use. VIP/COMPANY get the full catalog;
  // a normal USER only gets the classic template.
  const roleTemplateSeeds: Record<string, string[]> = {
    ADMIN: ["vip", "classic", "real-estate", "accounting", "logistics", "it-devops", "speaker", "tour-guide", "it-devops-engineer"],
    LOCAL: ["vip", "classic", "real-estate", "accounting", "logistics", "it-devops", "speaker", "tour-guide", "it-devops-engineer"],
    VIP: ["vip", "classic", "real-estate", "accounting", "logistics", "it-devops", "speaker", "tour-guide", "it-devops-engineer"],
    COMPANY: ["vip", "classic", "real-estate", "accounting", "logistics", "it-devops", "speaker", "tour-guide", "it-devops-engineer"],
    USER: ["classic"],
  };

  // Default template selected for users of each role.
  const roleDefaultTemplate: Record<string, string> = {
    ADMIN: "real-estate",
    LOCAL: "real-estate",
    VIP: "real-estate",
    COMPANY: "classic",
    USER: "classic",
  };

  for (const [roleName, slugs] of Object.entries(roleTemplateSeeds)) {
    const role = roles[roleName];
    if (!role) continue;

    const uniqueSlugs = [...new Set(slugs)];
    await prisma.roleTemplate.deleteMany({ where: { roleId: role.id } });
    await prisma.roleTemplate.createMany({
      data: uniqueSlugs.map((slug) => ({
        roleId: role.id,
        templateId: templates[slug].id,
      })),
    });
  }
  console.log(`  ✔ role → template access synced`);

  // ── 4. Plans ─────────────────────────────────────────────────────
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

  // ── 5. Admin User ────────────────────────────────────────────────
  const adminHashedPw = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  const adminEmail = "nquocnhu95it@gmail.com";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullname: "System Admin",
      password: adminHashedPw,
      isEmailVerified: true,
      userType: "LOCAL",
      roleId: roles["ADMIN"].id,
      status: "ACTIVE",
    },
    create: {
      email: adminEmail,
      fullname: "System Admin",
      password: adminHashedPw,
      isEmailVerified: true,
      userType: "LOCAL",
      roleId: roles["ADMIN"].id,
      status: "ACTIVE",
    },
  });
  console.log(`  ✔ ${adminEmail} user synced`);

  // Give every existing user a sensible default template if they don't have one.
  for (const [roleName, slug] of Object.entries(roleDefaultTemplate)) {
    const role = roles[roleName];
    if (!role) continue;
    await prisma.user.updateMany({
      where: { roleId: role.id, templateId: null },
      data: { templateId: templates[slug].id },
    });
  }
  console.log(`  ✔ default templates assigned to users`);

  // ── 6. Folders ───────────────────────────────────────────────────
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
