import type { Metadata } from "next";
import { redirect } from "next/navigation";
import RegisterForm from "./register-form";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create your free Swoshboard account with 200 MB secure personal cloud storage.",
};

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }
  return <RegisterForm />;
}