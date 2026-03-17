/**
 * LT316 Admin - Laser Bed Layout Workspace
 *
 * Entry point for the standalone admin layout module.
 * Mounted at /admin in the Next.js app router.
 *
 * This page is intentionally minimal: it renders
 * AdminMainPageShell which owns the page-level UI controls.
 */

import { AdminMainPageShell } from "@/components/admin/AdminMainPageShell";

export const metadata = {
  title: "LT316 Admin - Laser Bed Workspace",
  description: "Admin laser bed layout and SVG asset staging workspace",
};

export default function AdminPage() {
  return <AdminMainPageShell />;
}
