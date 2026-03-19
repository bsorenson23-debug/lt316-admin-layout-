"use client";

import { AdminLayoutShell } from "./AdminLayoutShell";
import styles from "@/app/admin/page.module.css";

export function AdminMainPageShell() {
  return (
    <div className={styles.page}>
      <AdminLayoutShell />
    </div>
  );
}
