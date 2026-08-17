import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { getSessionUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return <DashboardClient email={user.email} />;
}