import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/app/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");
  return (
    <Suspense>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
