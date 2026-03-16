import { redirect } from "next/navigation";

/**
 * Root route redirects to the admin workspace.
 * The admin layout module is the primary entry point for this application.
 */
export default function Home() {
  redirect("/admin");
}
