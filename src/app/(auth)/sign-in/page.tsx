import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/app/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

/* A signed-in visitor normally has nothing to do here — except when an OAuth
   client asked for a fresh sign-in, in which case sending them to the
   dashboard would abandon that client's request. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session?.user && !(await searchParams).client_id) redirect("/dashboard");
  return (
    <Suspense>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
