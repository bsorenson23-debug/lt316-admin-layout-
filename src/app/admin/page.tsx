/**
 * LT316 Admin – Laser Bed Layout Workspace
 *
 * Entry point for the standalone admin layout module.
 * Mounted at /admin in the Next.js app router.
 *
 * This page is intentionally minimal: it just renders the
 * AdminLayoutShell which owns all state and child panels.
 */

import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";
import styles from "./page.module.css";

export const metadata = {
  title: "LT316 Admin – Laser Bed Workspace",
  description: "Admin laser bed layout and SVG asset staging workspace",
};

export default function AdminPage() {
  return (
    <div className={styles.page}>
      <AdminLayoutShell />
    </div>
  );
}
