import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Swoshboard personal cloud storage and productivity workspace.",
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }
  return <LoginForm />;
}