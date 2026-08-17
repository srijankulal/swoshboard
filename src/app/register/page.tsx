import { redirect } from "next/navigation";
import RegisterForm from "./register-form";
import { getSessionUser } from "@/lib/auth";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }
  return <RegisterForm />;
}