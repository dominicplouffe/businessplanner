"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { signIn, signUp } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/redirects";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const MIN_PASSWORD = 10;

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  // Validated, not trusted: this value comes from the query string, and it is
  // used to redirect somebody the moment they have authenticated.
  const next = safeInternalPath(params.get("next"));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSignUp = mode === "sign-up";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isSignUp && name.trim().length < 2) errors.name = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Please enter a valid email address.";
    if (password.length < MIN_PASSWORD) {
      errors.password = `Passwords need at least ${MIN_PASSWORD} characters.`;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const result = isSignUp
        ? await signUp.email({ name: name.trim(), email, password })
        : await signIn.email({ email, password });

      if (result.error) {
        // Sign-in failures stay deliberately vague: saying which of the two was
        // wrong tells an attacker which emails have accounts.
        setFormError(
          isSignUp
            ? (result.error.message ?? "We could not create that account.")
            : "That email and password combination did not match an account.",
        );
        return;
      }

      router.push(next);
      router.refresh();
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error(error);
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-display-sm">
        {isSignUp ? "Start your plan" : "Welcome back"}
      </h1>
      <p className="mt-2.5 text-[0.95rem] leading-relaxed text-secondary">
        {isSignUp
          ? "Free to generate and read every page. No card, and nothing to cancel."
          : "Sign in to pick up where you left off."}
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        {isSignUp ? (
          <Field label="Your name" error={fieldErrors.name}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                required
              />
            )}
          </Field>
        ) : null}

        <Field label="Email" error={fieldErrors.email}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              required
            />
          )}
        </Field>

        <Field
          label="Password"
          hint={isSignUp ? `At least ${MIN_PASSWORD} characters.` : undefined}
          error={fieldErrors.password}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              required
            />
          )}
        </Field>

        {formError ? (
          <p role="alert" className="rounded-sm border border-critical/40 bg-critical/5 px-3 py-2.5 text-sm text-critical">
            {formError}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {pending ? "Just a moment…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-secondary">
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
