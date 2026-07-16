# Database Seeding Guide

> Step-by-step explanation of how `prisma/seed.ts` works,
> and how to update it for re-seeding.

---

## Table of Contents

1. [What the Seed Does](#1-what-the-seed-does)
2. [Step-by-Step Breakdown](#2-step-by-step-breakdown)
3. [How to Run the Seed](#3-how-to-run-the-seed)
4. [How to Update the Seed (Re-seeding)](#4-how-to-update-the-seed-re-seeding)
5. [Seed Output](#5-seed-output)
6. [Seeded Accounts](#6-seeded-accounts)
7. [Seeded Sharing Content](#7-seeded-sharing-content)

---

## 1. What the Seed Does

The seed file (`prisma/seed.ts`) populates the database with initial data
so you can test the API immediately after setup. It creates:

```
21 permissions → 3 roles → 3 users → 3 sharing content items
```

The seed is **idempotent** for permissions, roles, and users (uses `upsert`),
but **not** for sharing content (uses `create`). This means:

- Running the seed again will NOT duplicate permissions, roles, or users.
- Running the seed again WILL create duplicate sharing content items.

---

## 2. Step-by-Step Breakdown

### Step 1: Create 21 Permissions

```
Permission name format: "action:resource"
```

| Resource         | Actions                                  |
| ---------------- | ---------------------------------------- |
| user             | create, read, update, delete             |
| role             | create, read, update, delete             |
| permission       | create, read, update, delete             |
| sharingcontent   | create, read, update, delete             |
| history          | read                                     |
| dashboard        | read                                     |
| avatar           | create, read, delete                     |

**Total: 21 permissions**

Each permission is created with `upsert`:
- If the permission name already exists → skip (no duplicate).
- If it doesn't exist → create it.

```typescript
const perm = await prisma.permission.upsert({
  where: { name },        // e.g. "create:user"
  update: {},             // do nothing if exists
  create: { name },       // create if new
});
```

---

### Step 2: Create ADMIN Role (ALL permissions)

The ADMIN role gets **every single permission** (all 21).

```typescript
const adminRole = await prisma.role.upsert({
  where: { name: 'ADMIN' },
  update: {},
  create: { name: 'ADMIN' },
});

// Assign ALL permissions to ADMIN
await prisma.role.update({
  where: { id: adminRole.id },
  data: {
    permissions: {
      set: createdPermissions.map((p) => ({ id: p.id })),
    },
  },
});
```

---

### Step 3: Create USER Role (8 permissions)

The USER role gets only self-service permissions:

```
read:user, update:user
create:sharingcontent, read:sharingcontent, update:sharingcontent
create:avatar, read:avatar, delete:avatar
```

**Cannot:** manage roles, permissions, other users, history, dashboard.

---

### Step 4: Create VIP Role (11 permissions)

The VIP role gets everything USER has, plus:

```
+ read:history
+ read:dashboard
+ delete:sharingcontent
```

**Cannot:** manage roles, permissions, other users.

---

### Step 5: Create Admin User

```
Email:    admin@example.com
Password: Admin@123
Role:     ADMIN
```

Created with `upsert` — if the email already exists, it skips.

---

### Step 6: Create Demo User (USER role)

```
Email:    demo@example.com
Password: Demo@123
Role:     USER
```

---

### Step 7: Create VIP User

```
Email:    vip@example.com
Password: Vip@123
Role:     VIP
```

---

### Step 8: Create Admin Sharing Content (YouTube + TikTok)

Two items are created for the admin user to test the public NFC endpoint:

| Item   | URL                             | Icon    |
| ------ | ------------------------------- | ------- |
| YouTube | https://youtube.com/@quocnhu   | youtube |
| TikTok  | https://tiktok.com/@quocnhu    | tiktok  |

These are created with `prisma.sharingContent.create()` (NOT upsert),
so re-seeding will create duplicates.

---

### Step 9: Create Demo User Sharing Content

One item for the demo user:

| Item         | URL                          | Icon |
| ------------ | ---------------------------- | ---- |
| Welcome Post | https://example.com/shared-item | star |

---

## 3. How to Run the Seed

### First time (after creating tables):

```bash
# Make sure tables exist
npx prisma migrate dev

# Run the seed
npx prisma db seed
```

Or run directly:

```bash
npx ts-node prisma/seed.ts
```

### Verify seed worked:

```bash
# Check the database
npx prisma studio
```

---

## 4. How to Update the Seed (Re-seeding)

### Problem: Sharing content duplicates

If you run `npx prisma db seed` again, sharing content items will be
created again (duplicates). Permissions, roles, and users are safe
because they use `upsert`.

### Solution 1: Clear sharing content before re-seeding

```sql
-- Run in psql or Prisma Studio
DELETE FROM "SharingContent";
```

Then re-seed:

```bash
npx prisma db seed
```

### Solution 2: Update seed.ts to use upsert for sharing content

Replace the sharing content section with `upsert` to make it idempotent:

```typescript
// Step 8: Admin sharing content — use upsert to avoid duplicates
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
  await prisma.sharingContent.upsert({
    where: {
      // You need a unique constraint for this to work.
      // If you don't have one, use deleteMany + create instead.
    },
    update: {},
    create: item,
  });
}
```

### Solution 3: Delete-then-create pattern (recommended)

If your SharingContent table doesn't have a unique constraint on
`itemName` or `url`, use this pattern:

```typescript
// Step 8: Clear old sharing content, then create fresh
await prisma.sharingContent.deleteMany();

const adminSharingItems = [ /* ... */ ];
for (const item of adminSharingItems) {
  await prisma.sharingContent.create({ data: item });
}
```

### Solution 4: Full reset (nuclear option)

If you want to completely reset the database and re-seed from scratch:

```bash
# Reset the database (deletes ALL data)
npx prisma migrate reset

# Re-run the seed
npx prisma db seed
```

**Warning:** This deletes everything. Only use in development.

---

## 5. Seed Output

When you run `npx prisma db seed`, you'll see:

```
Seeding database...

Created 21 permissions
ADMIN role: ALL permissions
USER role: read/update own profile, CRUD sharing, avatar
VIP role: USER perms + history + dashboard + delete sharing
Admin user: admin@example.com
Demo user: demo@example.com
VIP user: vip@example.com
Admin sharing content: 2 items (YouTube, TikTok)
  → Test with: POST /sharing-content/public/user { "userId": "..." }
Demo sharing content created

--- Seed Complete ---
ADMIN : admin@example.com / Admin@123
USER  : demo@example.com / Demo@123
VIP   : vip@example.com / Vip@123
```

The admin user ID is printed — copy it to test the public NFC endpoint.

---

## 6. Seeded Accounts

| Role  | Email              | Password   | Permissions |
| ----- | ------------------ | ---------- | ----------- |
| ADMIN | admin@example.com  | Admin@123  | ALL (21)    |
| USER  | demo@example.com   | Demo@123   | 8           |
| VIP   | vip@example.com    | Vip@123    | 11          |

---

## 7. Seeded Sharing Content

### Admin (for NFC testing)

| Item   | URL                             | Icon    |
| ------ | ------------------------------- | ------- |
| YouTube | https://youtube.com/@quocnhu   | youtube |
| TikTok  | https://tiktok.com/@quocnhu    | tiktok  |

### Demo User

| Item         | URL                          | Icon |
| ------------ | ---------------------------- | ---- |
| Welcome Post | https://example.com/shared-item | star |

---

## Quick Reference Commands

```bash
# First seed
npx prisma migrate dev
npx prisma db seed

# Re-seed (clear sharing content first)
npx prisma db seed

# Full reset (deletes everything)
npx prisma migrate reset
npx prisma db seed

# Open Prisma Studio to inspect data
npx prisma studio

# Test the public NFC endpoint
curl -X POST http://localhost:3000/sharing-content/public/user \
  -H "Content-Type: application/json" \
  -d '{"userId": "PASTE_ADMIN_USER_ID_HERE"}'
```
