# Quoc Nhu NFC Tap — Next.js Frontend Guide

> This document covers everything needed to build the Next.js frontend:
> project structure, authentication, middleware, layout, pages, API integration,
> NFC card handling, and security.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Environment Variables](#2-environment-variables)
3. [File Structure](#3-file-structure)
4. [Backend API Reference](#4-backend-api-reference)
5. [Axios Setup](#5-axios-setup)
6. [Authentication — NextAuth.js](#6-authentication--nextauthjs)
7. [Middleware — Route Protection](#7-middleware--route-protection)
8. [Global Layout — Sidebar + Dashboard Shell](#8-global-layout--sidebar--dashboard-shell)
9. [Theme Toggle (Dark/Light)](#9-theme-toggle-darklight)
10. [Pages](#10-pages)
    - [10.1 Home (Public)](#101-home-public)
    - [10.2 Login](#102-login)
    - [10.3 Register](#103-register)
    - [10.4 Dashboard](#104-dashboard)
    - [10.5 Users (3 Tabs)](#105-users-3-tabs)
    - [10.6 Roles](#106-roles)
    - [10.7 Permissions](#107-permissions)
    - [10.8 Sharing Content](#108-sharing-content)
    - [10.9 History](#109-history)
    - [10.10 Avatar](#1010-avatar)
    - [10.11 NFC Card](#1011-nfc-card)
    - [10.12 Profile](#1012-profile)
    - [10.13 Forgot Password](#1013-forgot-password)
    - [10.14 Reset Password](#1014-reset-password)
11. [NFC Card Flow](#11-nfc-card-flow)
12. [Security](#12-security)
13. [Seeded Accounts](#13-seeded-accounts)

---

## 1. Tech Stack

| Layer          | Library                                |
| -------------- | -------------------------------------- |
| Framework      | Next.js 14+ (App Router)               |
| UI Library     | Ant Design 5 (antd) — zero manual CSS |
| Auth           | next-auth (NextAuth.js v4)             |
| HTTP Client    | axios (with interceptors)              |
| State          | React hooks + SWR or React Query       |
| Form           | Ant Design Form                        |
| Table          | Ant Design Table (pagination)          |
| Icons          | @ant-design/icons                      |
| Animation      | Framer Motion (homepage only)          |
| NFC (Web)      | Web NFC API (navigator.nfc)            |
| Dark Mode      | antd ConfigProvider + theme algorithm  |

---

## 2. Environment Variables

Create `.env.local` at the project root:

```env
# Backend
NEXT_PUBLIC_API_URL=http://localhost:3000

# NextAuth
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=your-nextauth-secret-here

# Feature Toggles
NEXT_PUBLIC_ENABLE_NFC=true
NEXT_PUBLIC_ENABLE_DARK_MODE=true
```

---

## 3. File Structure

```
nfc-tap-frontend/
├── .env.local
├── .eslintrc.json
├── next.config.js
├── package.json
├── tsconfig.json
│
├── public/
│   ├── favicon.ico
│   └── nfc-scan.json              # Lottie animation for NFC
│
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout (AntdRegistry + providers)
│   │   ├── page.tsx                # Home (public) — animated landing
│   │   ├── loading.tsx             # Global skeleton
│   │   │
│   │   ├── (auth)/                 # Public auth routes (no sidebar)
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   │
│   │   └── (dashboard)/            # Protected routes (sidebar layout)
│   │       ├── layout.tsx          # Dashboard shell with sidebar
│   │       ├── dashboard/page.tsx
│   │       │
│   │       ├── users/
│   │       │   └── page.tsx        # 3 tabs: Users | Roles | Permissions
│   │       │
│   │       ├── sharing-content/
│   │       │   └── page.tsx
│   │       │
│   │       ├── history/
│   │       │   └── page.tsx
│   │       │
│   │       ├── avatar/
│   │       │   └── page.tsx
│   │       │
│   │       ├── nfc/
│   │       │   └── page.tsx        # NFC card tap & display
│   │       │
│   │       └── profile/
│   │           └── page.tsx
│   │
│   ├── components/
│   │   ├── providers/
│   │   │   ├── AntdProvider.tsx    # AntdRegistry + ConfigProvider
│   │   │   ├── AuthProvider.tsx    # NextAuth SessionProvider
│   │   │   └── ThemeToggle.tsx     # Dark/Light switch
│   │   │
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   │   ├── Header.tsx          # Top bar (user info, logout, theme)
│   │   │   └── DashboardShell.tsx  # Combines Sidebar + Header + content
│   │   │
│   │   ├── users/
│   │   │   ├── UserTable.tsx       # Table with search + pagination
│   │   │   ├── UserFormModal.tsx   # Create/Edit modal
│   │   │   ├── RoleTable.tsx
│   │   │   ├── RoleFormModal.tsx
│   │   │   ├── PermissionTable.tsx
│   │   │   └── PermissionFormModal.tsx
│   │   │
│   │   ├── sharing-content/
│   │   │   ├── SharingTable.tsx
│   │   │   └── SharingFormModal.tsx
│   │   │
│   │   ├── history/
│   │   │   └── HistoryTable.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── StatsCards.tsx      # 5 stat cards
│   │   │   ├── RecentActivity.tsx
│   │   │   └── PermissionsBadge.tsx
│   │   │
│   │   ├── nfc/
│   │   │   ├── NfcScanner.tsx      # Web NFC read logic
│   │   │   └── NfcCardView.tsx     # Displays scanned card info
│   │   │
│   │   └── common/
│   │       ├── AuthGuard.tsx       # Redirects unauthenticated users
│   │       ├── PermissionGate.tsx  # Shows/hides based on permission
│   │       └── PageHeader.tsx      # Reusable page title + breadcrumb
│   │
│   ├── lib/
│   │   ├── axios.ts               # Axios instance with interceptors
│   │   ├── auth.ts                # NextAuth config + options
│   │   └── api.ts                 # API call functions (one per resource)
│   │
│   ├── hooks/
│   │   ├── useAuth.ts             # useSession wrapper
│   │   ├── usePermission.ts       # Check if user has permission
│   │   └── useNfc.ts              # Web NFC hook
│   │
│   ├── types/
│   │   ├── api.ts                 # ApiResponse<T>, PaginatedResponse<T>
│   │   ├── user.ts                # User, Role, Permission types
│   │   ├── sharing-content.ts
│   │   ├── history.ts
│   │   └── next-auth.d.ts         # NextAuth type augmentation
│   │
│   └── utils/
│       ├── constants.ts           # Sidebar menu items, permission labels
│       └── helpers.ts             # formatDate, truncate, etc.
│
└── middleware.ts                   # Next.js middleware (route guard)
```

---

## 4. Backend API Reference

Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`)

All responses follow this shape:

```ts
interface ApiResponse<T = any> {
  statusCode: number;
  success: boolean;
  message: string;
  data?: T;
}
```

Paginated responses (users list) include:

```ts
{
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

### Auth Endpoints

| Method | Path                        | Auth | Body                                           |
| ------ | --------------------------- | ---- | ---------------------------------------------- |
| POST   | `/auth/signup`              | No   | `{ email, password, fullname }`                |
| POST   | `/auth/signin`              | No   | `{ email, password }`                          |
| POST   | `/auth/request-reset-password` | No | `{ email }`                                  |
| POST   | `/auth/reset-password`      | No   | `{ token, email, newPassword }`                |
| POST   | `/auth/logout`              | Yes  | —                                              |

> Auth endpoints return `{ statusCode, success, message }` only.
> The JWT is set as an httpOnly cookie named `jwt` — never returned in body.

### User Endpoints

| Method | Path                        | Auth      | Permission         | Body                                         |
| ------ | --------------------------- | --------- | ------------------ | -------------------------------------------- |
| GET    | `/users`                    | Yes       | `read:user`        | Query: `?page=&limit=&search=`              |
| GET    | `/users/me`                 | Yes       | `read:user`        | —                                            |
| POST   | `/users`                    | Yes       | `create:user`      | `{ email, password, fullname, roleId? }`    |
| POST   | `/users/update`             | Yes       | `update:user`      | `{ id, email?, fullname?, roleId? }`        |
| POST   | `/users/delete`             | Yes       | `delete:user`      | `{ id }`                                     |
| POST   | `/users/me/update`          | Yes       | `update:user`      | `{ email?, fullname?, avatarUrl? }`         |
| POST   | `/users/me/change-password` | Yes       | `update:user`      | `{ currentPassword, newPassword }`          |
| POST   | `/users/assign-permissions` | Yes       | `update:permission`| `{ id, permissionIds[] }`                   |

### Role Endpoints

| Method | Path             | Auth | Permission     | Body                       |
| ------ | ---------------- | ---- | -------------- | -------------------------- |
| POST   | `/roles`         | Yes  | `create:role`  | `{ name }`                 |
| POST   | `/roles/update`  | Yes  | `update:role`  | `{ id, name?, permissionIds? }` |
| POST   | `/roles/delete`  | Yes  | `delete:role`  | `{ id }`                   |

### Permission Endpoints

| Method | Path                    | Auth | Permission         | Body          |
| ------ | ----------------------- | ---- | ------------------ | ------------- |
| POST   | `/permissions`          | Yes  | `create:permission`| `{ name }`    |
| POST   | `/permissions/update`   | Yes  | `update:permission`| `{ id, name? }` |
| POST   | `/permissions/delete`   | Yes  | `delete:permission`| `{ id }`      |

### Sharing Content Endpoints

| Method | Path                          | Auth | Permission               | Body / Params                                       |
| ------ | ----------------------------- | ---- | ------------------------ | --------------------------------------------------- |
| GET    | `/sharing-content`            | Yes  | `read:sharingcontent`    | —                                                   |
| GET    | `/sharing-content/me`         | Yes  | `read:sharingcontent`    | —                                                   |
| GET    | `/sharing-content/public/user`| No   | —                        | Query: `?userId=`                                   |
| POST   | `/sharing-content`            | Yes  | `create:sharingcontent`  | `{ url, itemName, icon }`                           |
| POST   | `/sharing-content/get`        | Yes  | `read:sharingcontent`    | `{ id }`                                            |
| POST   | `/sharing-content/update`     | Yes  | `update:sharingcontent`  | `{ id, url?, itemName?, icon? }`                    |
| POST   | `/sharing-content/delete`     | Yes  | `delete:sharingcontent`  | `{ id }`                                            |

### History Endpoints

| Method | Path                  | Auth | Permission     | Body                  |
| ------ | --------------------- | ---- | -------------- | --------------------- |
| GET    | `/history`            | Yes  | `read:history` | —                     |
| GET    | `/history/me`         | Yes  | `read:history` | —                     |
| GET    | `/history/recent`     | Yes  | `read:history` | Query: `?limit=`      |
| GET    | `/history/:userId`    | Yes  | `read:history` | —                     |

### Dashboard Endpoints

| Method | Path                    | Auth | Permission       | Body      |
| ------ | ----------------------- | ---- | ---------------- | --------- |
| GET    | `/dashboard/stats`      | Yes  | `read:dashboard` | —         |
| GET    | `/dashboard/permissions`| Yes  | `read:dashboard` | —         |
| GET    | `/dashboard/activity`   | Yes  | `read:dashboard` | Query: `?limit=` |

### Avatar Endpoints

| Method | Path             | Auth | Permission      | Body                 |
| ------ | ---------------- | ---- | --------------- | -------------------- |
| POST   | `/avatar/upload` | Yes  | `create:avatar` | FormData `file`      |
| GET    | `/avatar/me`     | Yes  | `read:avatar`   | —                    |
| DELETE | `/avatar/me`     | Yes  | `delete:avatar` | —                    |

---

## 5. Axios Setup

`src/lib/axios.ts`:

```ts
import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 15000,
  withCredentials: true, // send httpOnly cookie with every request
  headers: { "Content-Type": "application/json" },
});

// Response interceptor — handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token expired or invalid — redirect to login
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
```

`src/lib/api.ts` — one function per endpoint:

```ts
import api from "./axios";
import type {
  ApiResponse,
  PaginatedResponse,
  User,
  Role,
  Permission,
  SharingContent,
  History,
  DashboardStats,
  UserPermissions,
} from "@/types";

// ── Auth ──
export const authApi = {
  signin: (data: { email: string; password: string }) =>
    api.post<ApiResponse>("/auth/signin", data),
  signup: (data: { email: string; password: string; fullname: string }) =>
    api.post<ApiResponse>("/auth/signup", data),
  logout: () => api.post<ApiResponse>("/auth/logout"),
  requestReset: (data: { email: string }) =>
    api.post<ApiResponse>("/auth/request-reset-password", data),
  resetPassword: (data: { token: string; email: string; newPassword: string }) =>
    api.post<ApiResponse>("/auth/reset-password", data),
};

// ── Users ──
export const userApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiResponse<PaginatedResponse<User>>>("/users", { params }),
  getMe: () => api.get<ApiResponse<User>>("/users/me"),
  create: (data: { email: string; password: string; fullname: string; roleId?: string }) =>
    api.post<ApiResponse<User>>("/users", data),
  update: (data: { id: string; email?: string; fullname?: string; roleId?: string }) =>
    api.post<ApiResponse<User>>("/users/update", data),
  remove: (id: string) =>
    api.post<ApiResponse>("/users/delete", { id }),
  updateMe: (data: { email?: string; fullname?: string; avatarUrl?: string }) =>
    api.post<ApiResponse<User>>("/users/me/update", data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post<ApiResponse>("/users/me/change-password", data),
  assignPermissions: (id: string, permissionIds: string[]) =>
    api.post<ApiResponse>("/users/assign-permissions", { id, permissionIds }),
};

// ── Roles ──
export const roleApi = {
  create: (data: { name: string }) =>
    api.post<ApiResponse<Role>>("/roles", data),
  update: (data: { id: string; name?: string; permissionIds?: string[] }) =>
    api.post<ApiResponse<Role>>("/roles/update", data),
  remove: (id: string) =>
    api.post<ApiResponse>("/roles/delete", { id }),
};

// ── Permissions ──
export const permissionApi = {
  create: (data: { name: string }) =>
    api.post<ApiResponse<Permission>>("/permissions", data),
  update: (data: { id: string; name?: string }) =>
    api.post<ApiResponse<Permission>>("/permissions/update", data),
  remove: (id: string) =>
    api.post<ApiResponse>("/permissions/delete", { id }),
};

// ── Sharing Content ──
export const sharingApi = {
  list: () => api.get<ApiResponse<SharingContent[]>>("/sharing-content"),
  myContent: () => api.get<ApiResponse<SharingContent[]>>("/sharing-content/me"),
  getOne: (id: string) =>
    api.post<ApiResponse<SharingContent>>("/sharing-content/get", { id }),
  create: (data: { url: string; itemName: string; icon: string }) =>
    api.post<ApiResponse<SharingContent>>("/sharing-content", data),
  update: (data: { id: string; url?: string; itemName?: string; icon?: string }) =>
    api.post<ApiResponse<SharingContent>>("/sharing-content/update", data),
  remove: (id: string) =>
    api.post<ApiResponse>("/sharing-content/delete", { id }),
  // Public — no auth required. Used by NFC tap.
  publicByUser: (userId: string) =>
    api.get<ApiResponse<{ user: any; items: SharingContent[] }>>(
      "/sharing-content/public/user",
      { params: { userId } }
    ),
};

// ── History ──
export const historyApi = {
  list: () => api.get<ApiResponse<History[]>>("/history"),
  myHistory: () => api.get<ApiResponse<History[]>>("/history/me"),
  recent: (limit?: number) =>
    api.get<ApiResponse<History[]>>("/history/recent", { params: { limit } }),
  byUser: (userId: string) =>
    api.get<ApiResponse<History[]>>(`/history/${userId}`),
};

// ── Dashboard ──
export const dashboardApi = {
  stats: () => api.get<ApiResponse<DashboardStats>>("/dashboard/stats"),
  permissions: () => api.get<ApiResponse<UserPermissions>>("/dashboard/permissions"),
  activity: (limit?: number) =>
    api.get<ApiResponse<History[]>>("/dashboard/activity", { params: { limit } }),
};

// ── Avatar ──
export const avatarApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<ApiResponse<{ avatarUrl: string }>>("/avatar/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  get: () => api.get<ApiResponse<{ avatarUrl: string | null }>>("/avatar/me"),
  remove: () => api.delete<ApiResponse>("/avatar/me"),
};
```

---

## 6. Authentication — NextAuth.js

### Types

`src/types/next-auth.d.ts`:

```ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      fullname: string;
      role: string;
      permissions: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    fullname: string;
    role: string;
    permissions: string[];
  }
}
```

### Config

`src/lib/auth.ts`:

```ts
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { dashboardApi } from "./api";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 15 * 60 }, // 15 min
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // The backend sets httpOnly cookie on signin.
        // We use axios with withCredentials: true so the cookie is set.
        // Then we fetch user info from /dashboard/permissions.
        const { authApi } = await import("./api");

        try {
          await authApi.signin({
            email: credentials.email,
            password: credentials.password,
          });

          // Cookie is now set — fetch user permissions
          const { data: permData } = await dashboardApi.permissions();

          if (!permData?.data) return null;

          const { user, role, mergedPermissions } = permData.data;

          return {
            id: user.id,
            email: user.email,
            name: user.fullname,
            fullname: user.fullname,
            role,
            permissions: mergedPermissions,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email as string;
        token.fullname = (user as any).fullname;
        token.role = (user as any).role;
        token.permissions = (user as any).permissions;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.email = token.email as string;
      session.user.fullname = token.fullname as string;
      session.user.role = token.role as string;
      session.user.permissions = token.permissions as string[];
      return session;
    },
  },
};
```

### API Route

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

---

## 7. Middleware — Route Protection

`middleware.ts` (at project root):

```ts
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Admin-only routes
    const adminRoutes = ["/users", "/roles", "/permissions"];
    const isAdminRoute = adminRoutes.some((r) => pathname.startsWith(r));

    if (isAdminRoute && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/users/:path*",
    "/sharing-content/:path*",
    "/history/:path*",
    "/avatar/:path*",
    "/nfc/:path*",
    "/profile/:path*",
  ],
};
```

---

## 8. Global Layout — Sidebar + Dashboard Shell

### Root Layout

`src/app/layout.tsx`:

```tsx
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AuthProvider } from "@/components/providers/AuthProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <AuthProvider>{children}</AuthProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
```

### Dashboard Layout (Sidebar)

`src/app/(dashboard)/layout.tsx`:

```tsx
import { DashboardShell } from "@/components/layout/DashboardShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
```

### Sidebar Menu Structure

`src/utils/constants.ts`:

```ts
import {
  DashboardOutlined,
  UserOutlined,
  ShareAltOutlined,
  HistoryOutlined,
  CameraOutlined,
  CreditCardOutlined,
} from "@ant-design/icons";

// All menu items in one place — each has a required permission.
// Sidebar renders only the items the user has permission for.
export const menuItems = [
  {
    key: "/dashboard",
    icon: <DashboardOutlined />,
    label: "Dashboard",
    permission: "read:dashboard",
  },
  {
    key: "/users",
    icon: <UserOutlined />,
    label: "User Management",
    permission: "read:user",
  },
  {
    key: "/sharing-content",
    icon: <ShareAltOutlined />,
    label: "Sharing Content",
    permission: "read:sharingcontent",
  },
  {
    key: "/history",
    icon: <HistoryOutlined />,
    label: "History",
    permission: "read:history",
  },
  {
    key: "/avatar",
    icon: <CameraOutlined />,
    label: "Avatar",
    permission: "read:avatar",
  },
  {
    key: "/nfc",
    icon: <CreditCardOutlined />,
    label: "NFC Card",
    permission: "read:sharingcontent",
  },
];
```

### DashboardShell Component

`src/components/layout/DashboardShell.tsx`:

```tsx
"use client";

import { Layout, Menu, Button, Avatar, Dropdown, Space, Typography } from "antd";
import {
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { menuItems } from "@/utils/constants";
import { ThemeToggle } from "@/components/providers/ThemeToggle";
import { PermissionGate } from "@/components/common/PermissionGate";

const { Header, Sider, Content } = Layout;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  // Filter menu items by user permissions
  const allowedItems = menuItems.filter((item) =>
    session?.user?.permissions?.includes(item.permission)
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        breakpoint="lg"
        theme="dark"
      >
        <div style={{ height: 32, margin: 16, textAlign: "center" }}>
          <Typography.Title level={4} style={{ color: "#fff", margin: 0 }}>
            {collapsed ? "QN" : "Quoc Nhu NFC"}
          </Typography.Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={allowedItems}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Space>
            <ThemeToggle />
            <Dropdown
              menu={{
                items: [
                  {
                    key: "profile",
                    icon: <UserOutlined />,
                    label: "Profile",
                    onClick: () => router.push("/profile"),
                  },
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    label: "Logout",
                    onClick: () => signOut({ callbackUrl: "/login" }),
                  },
                ],
              }}
            >
              <Avatar style={{ backgroundColor: "#1677ff", cursor: "pointer" }}>
                {session?.user?.fullname?.charAt(0)?.toUpperCase()}
              </Avatar>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
```

---

## 9. Theme Toggle (Dark/Light)

`src/components/providers/ThemeToggle.tsx`:

```tsx
"use client";

import { Switch } from "antd";
import { BulbOutlined } from "@ant-design/icons";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <Switch
      checked={isDark}
      onChange={toggle}
      checkedChildren={<BulbOutlined />}
      unCheckedChildren={<BulbOutlined />}
    />
  );
}
```

The `useTheme` hook stores the preference in `localStorage` and wraps the app
in `<ConfigProvider theme={{ algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>`.

---

## 10. Pages

### 10.1 Home (Public)

Route: `/`

This is the landing page. It shows:

```
Welcome to Quoc Nhu NFC Tap!
Make your sharing easily
```

- Centered text with Framer Motion entrance animations (fade-in + slide-up).
- Colorful gradient background or animated shapes behind the text.
- Two buttons: "Login" and "Register" (Ant Design `Button` with `type="primary"`).
- If the user is already logged in, the buttons redirect to `/dashboard`.

### 10.2 Login

Route: `/login`

- Ant Design `Form` with email + password fields.
- On submit: calls `signIn("credentials", { email, password })` from next-auth.
- On success: redirect to `/dashboard`.
- On error: `message.error("Invalid email or password")`.
- Link to register page and forgot password.

### 10.3 Register

Route: `/register`

- Fields: fullname, email, password, confirm password.
- Password rules displayed as helper text (uppercase, lowercase, number, special char).
- On submit: calls `authApi.signup()` then auto-signs in.
- Link back to login.

### 10.4 Dashboard

Route: `/dashboard`

Layout:
```
┌────────────────────────────────────────────┐
│ [Users]  [Roles]  [Permissions]  [Sharing] │   <- 5 stat cards
│    125        3          20            48   │
├────────────────────────────────────────────┤
│ Recent Activity         │ Your Permissions  │
│ ┌─────────────────────┐ │ ┌──────────────┐  │
│ │ Admin created user  │ │ │ read:user    │  │
│ │ 2 min ago           │ │ │ create:avatar│  │
│ │ ...                 │ │ │ ...          │  │
│ └─────────────────────┘ │ └──────────────┘  │
└────────────────────────────────────────────┘
```

Components:
- `StatsCards` — 5 `Card` components (Total Users, Roles, Permissions, Sharing Content, Histories) with Ant Design `Statistic`.
- `RecentActivity` — `List` of recent history items with timestamps.
- `PermissionsBadge` — shows the logged-in user's merged permissions as `Tag` components.

Data: `dashboardApi.stats()`, `dashboardApi.activity(10)`, `dashboardApi.permissions()`.

### 10.5 Users (3 Tabs)

Route: `/users`

This is a single page with **3 tabs** using Ant Design `Tabs`:

```
┌──────────────────────────────────────────────┐
│  [ Users ]  [ Roles ]  [ Permissions ]       │
├──────────────────────────────────────────────┤
│  Tab content below                           │
└──────────────────────────────────────────────┘
```

#### Tab 1: Users

- `Table` with columns: Fullname, Email, Role, Avatar, Status (email verified badge), Actions.
- Search bar above the table (debounced).
- Pagination (server-side via `?page=&limit=`).
- Actions column: Edit (pencil icon), Delete (trash icon).
- "Create User" button opens `UserFormModal`.

`UserFormModal`:
- Create mode: fullname, email, password, role (Select from `/roles`).
- Edit mode: fullname, email, role (password field hidden).
- Validation with Ant Design Form rules matching backend DTOs.

`AssignPermissionsModal`:
- Triggered from an "Assign Permissions" button in the actions column.
- Shows a Transfer or Checkbox.Group of all available permissions.
- Calls `userApi.assignPermissions(userId, permissionIds)`.

#### Tab 2: Roles

- `Table` with columns: Name, Permissions (rendered as `Tag` list), Actions.
- "Create Role" button opens `RoleFormModal`.

`RoleFormModal`:
- Create mode: name input.
- Edit mode: name input + Checkbox.Group of all permissions to assign.
- Calls `roleApi.create()` or `roleApi.update()`.

#### Tab 3: Permissions

- `Table` with columns: Name, Assigned Roles (count), Actions.
- "Create Permission" button opens `PermissionFormModal`.

`PermissionFormModal`:
- Simple form with a name input (e.g. `create:user`).
- Calls `permissionApi.create()` or `permissionApi.update()`.

### 10.6 Roles

> Handled inside the Users page (Tab 2 above).
> If you prefer a separate page at `/roles`, duplicate the tab content
> and wrap it in its own page component.

### 10.7 Permissions

> Handled inside the Users page (Tab 3 above).

### 10.8 Sharing Content

Route: `/sharing-content`

- `Table` with columns: Item Name, URL (clickable link), Icon, Owner, Created At, Actions.
- "Create" button opens `SharingFormModal`.
- Only the owner of a sharing content item sees Edit/Delete actions.

`SharingFormModal`:
- Fields: itemName, URL, icon (text input or icon picker).
- Create: `sharingApi.create()`.
- Edit: `sharingApi.update()`.

### 10.9 History

Route: `/history`

- `Table` with columns: User, Action, Entity Type, Entity ID, Details, Timestamp.
- Timestamps formatted with `dayjs` or `date-fns`.
- No create/edit — read-only.
- Filter by user (admin can see all, regular users see only their own via `/history/me`).

### 10.10 Avatar

Route: `/avatar`

- Show current avatar image (or placeholder).
- Upload button: opens file picker (accepts jpeg, png, webp, max 2MB).
- Preview the image before upload.
- Delete button to remove avatar.
- Calls `avatarApi.upload()`, `avatarApi.get()`, `avatarApi.remove()`.

### 10.11 NFC Card

Route: `/nfc`

- If `NEXT_PUBLIC_ENABLE_NFC=true`, show the NFC scanner.
- `NfcScanner` component:
  - Detects if Web NFC is available (`navigator.nfc`).
  - If not supported: show a warning "NFC is not supported on this device/browser".
  - If supported: show a "Scan NFC Card" button.
  - On tap: read the NDEF message, extract the userId from payload.
  - Call `sharingApi.publicByUser(userId)` — no auth needed.
- `NfcCardView` component:
  - After scanning, display the user's profile and sharing links.
  - Shows fullname, avatar, and all sharing content items (YouTube, TikTok, etc.).
  - Each item is a clickable link opening in a new tab.

### 10.12 Profile

Route: `/profile`

- Show current user info (avatar, name, email, role).
- Edit form: fullname, email.
- Change password form: current password, new password, confirm new password.
- Calls `userApi.updateMe()` and `userApi.changePassword()`.

### 10.13 Forgot Password

Route: `/forgot-password`

- Single field: email.
- Calls `authApi.requestReset()`.
- Show success message: "If the email exists, a reset link has been sent."

### 10.14 Reset Password

Route: `/reset-password?token=...&email=...`

- Reads `token` and `email` from URL query params.
- Fields: new password, confirm password.
- Calls `authApi.resetPassword()`.
- On success: redirect to login.

---

## 11. NFC Card Flow

```
┌─────────────────────────────────────────────────────┐
│  User taps NFC card on phone/tablet                 │
│         │                                           │
│         ▼                                           │
│  Web NFC API reads NDEF message                     │
│         │                                           │
│         ▼                                           │
│  Extract userId from NFC payload                    │
│         │                                           │
│         ▼                                           │
│  GET /sharing-content/public/user?userId=xxx        │
│  (no auth required)                                 │
│         │                                           │
│         ▼                                           │
│  Display in NfcCardView:                            │
│  ┌──────────────────────────────┐                   │
│  │  NFC Card Detected           │                   │
│  │  ┌────────────────────────┐  │                   │
│  │  │  User: System Admin    │  │                   │
│  │  │  YouTube: youtube.com  │  │                   │
│  │  │  TikTok:  tiktok.com   │  │                   │
│  │  └────────────────────────┘  │                   │
│  └──────────────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

Implementation notes:
- Web NFC is only available in Chromium browsers (Chrome, Edge) on Android.
- On unsupported browsers, show a graceful fallback message.
- The public endpoint returns the user's fullname, avatar, and all sharing content items.
- No authentication is needed for the public endpoint — anyone with the userId can view it.

---

## 12. Security

### Frontend Security Checklist

| Layer            | What to do                                                               |
| ---------------- | ------------------------------------------------------------------------ |
| **Middleware**    | Redirect unauthenticated users to `/login`. Block admin routes for non-admins. |
| **CSRF**         | `withCredentials: true` on axios. Backend sets `SameSite: lax` on cookie. |
| **XSS**          | Never use `dangerouslySetInnerHTML`. Ant Design handles rendering safely. |
| **Sensitive data** | Never store JWT in localStorage/ sessionStorage. httpOnly cookie only. |
| **Env vars**     | Only expose `NEXT_PUBLIC_*` to the client. Secrets stay on the server.   |
| **Rate limiting** | Frontend should handle 429 gracefully (show "Too many requests").        |
| **Input validation** | Ant Design Form rules + match backend DTO validation rules.           |
| **Logout**       | Always call `/auth/logout` to clear the httpOnly cookie server-side.     |
| **Token refresh** | 15-min JWT. On 401, redirect to login. No client-side refresh.          |

### Axios Interceptor Summary

```
Request  → withCredentials: true (sends httpOnly cookie)
Response → 401 → redirect to /login
Response → 403 → show "Insufficient permissions" message
Response → other errors → show antd notification
```

### Permission Gate Component

`src/components/common/PermissionGate.tsx`:

```tsx
"use client";

import { useSession } from "next-auth/react";

interface Props {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ permission, children, fallback = null }: Props) {
  const { data: session } = useSession();
  const hasPermission = session?.user?.permissions?.includes(permission);
  return <>{hasPermission ? children : fallback}</>;
}
```

Usage — hide the "Delete" button if user lacks `delete:user`:

```tsx
<PermissionGate permission="delete:user">
  <Button danger onClick={handleDelete}>Delete</Button>
</PermissionGate>
```

---

## 13. Seeded Accounts

| Role  | Email              | Password   |
| ----- | ------------------ | ---------- |
| ADMIN | admin@example.com  | Admin@123  |
| USER  | demo@example.com   | Demo@123   |
| VIP   | vip@example.com    | Vip@123    |

### Seeded Sharing Content

| User  | Item   | URL                          | Icon    |
| ----- | ------ | ---------------------------- | ------- |
| ADMIN | YouTube| https://youtube.com/@quocnhu | youtube |
| ADMIN | TikTok | https://tiktok.com/@quocnhu  | tiktok  |
| USER  | Welcome Post | https://example.com/shared-item | star |

### Test Public NFC Endpoint (No Auth)

```bash
# Get admin's sharing content — just pass the userId
curl http://localhost:3000/sharing-content/public/user?userId=<ADMIN_USER_ID>
```

---

## Permission Summary

All 21 permissions seeded in the database:

```
create:user          read:user            update:user          delete:user
create:role          read:role            update:role          delete:role
create:permission    read:permission      update:permission    delete:permission
create:sharingcontent  read:sharingcontent  update:sharingcontent  delete:sharingcontent
read:history
read:dashboard
create:avatar        read:avatar          delete:avatar
```

Role → Permission mapping:

| Permission         | ADMIN | USER | VIP |
| ------------------ | :---: | :--: | :-: |
| create:user        |  ✅   |  ❌  | ❌  |
| read:user          |  ✅   |  ✅  | ✅  |
| update:user        |  ✅   |  ✅  | ✅  |
| delete:user        |  ✅   |  ❌  | ❌  |
| create:role        |  ✅   |  ❌  | ❌  |
| read:role          |  ✅   |  ❌  | ❌  |
| update:role        |  ✅   |  ❌  | ❌  |
| delete:role        |  ✅   |  ❌  | ❌  |
| create:permission  |  ✅   |  ❌  | ❌  |
| read:permission    |  ✅   |  ❌  | ❌  |
| update:permission  |  ✅   |  ❌  | ❌  |
| delete:permission  |  ✅   |  ❌  | ❌  |
| create:sharingcontent | ✅ |  ✅  | ✅  |
| read:sharingcontent   | ✅ |  ✅  | ✅  |
| update:sharingcontent | ✅ |  ✅  | ✅  |
| delete:sharingcontent | ✅ |  ❌  | ✅  |
| read:history       |  ✅   |  ❌  | ✅  |
| read:dashboard     |  ✅   |  ❌  | ✅  |
| create:avatar      |  ✅   |  ✅  | ✅  |
| read:avatar        |  ✅   |  ✅  | ✅  |
| delete:avatar      |  ✅   |  ✅  | ✅  |

---

## Quick Start

```bash
# 1. Create the Next.js project
npx create-next-app@latest nfc-tap-frontend --typescript --app --tailwind=no
cd nfc-tap-frontend

# 2. Install dependencies
npm install antd @ant-design/icons @ant-design/nextjs-registry \
  next-auth axios framer-motion dayjs

# 3. Copy the file structure from Section 3 into src/

# 4. Set up .env.local from Section 2

# 5. Run
npm run dev
# Frontend runs on http://localhost:3001
# Backend runs on http://localhost:3000 (or 4000)
```
