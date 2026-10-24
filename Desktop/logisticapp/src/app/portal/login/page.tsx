"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function PortalLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loginError = searchParams.get("error");

  const loginErrorMessage: Record<string, string> = {
    session_required: "Your session has expired. Please sign in again.",
    role_verification_failed:
      "We could not verify your portal role. Please contact an administrator.",
    unauthorized: "Your account is not authorized to access this portal.",
    invalid_invitation_link:
      "This invitation link is invalid. Please contact an administrator.",
    invitation_link_invalid:
      "This invitation link has expired or is invalid. Please request assistance.",
    invitation_expired:
      "Your invitation has expired. Please contact an administrator.",
    invitation_not_found:
      "No matching invitation was found. Please contact an administrator.",
    invitation_finalization_failed:
      "We could not complete your invitation. Please contact an administrator.",
    invitation_service_unavailable:
      "The invitation service is temporarily unavailable. Please try again.",
    email_not_verified:
      "Your email could not be verified. Please reopen your invitation link.",
    missing_auth_code:
      "The invitation link is incomplete. Please use the original invitation email.",
    session_unavailable:
      "Your session could not be established. Please try again.",
    configuration_error:
      "The service is temporarily unavailable. Please contact an administrator.",
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError("Invalid email or password. Please try again.");
        return;
      }

      // The server verifies the assigned role before routing.
      router.replace("/portal/continue");
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">
            Delivery Platform
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Merchant and Rider Login
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Sign in to access your assigned portal.
          </p>
        </div>

        {loginError && loginErrorMessage[loginError] && (
          <p
            role="alert"
            className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
          >
            {loginErrorMessage[loginError]}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Email address
            </label>

            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 px-5 py-3 font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Are you a platform administrator?{" "}
          <Link
            href="/admin/login"
            className="font-medium text-violet-700 hover:text-violet-800"
          >
            Admin login
          </Link>
        </p>
      </section>
    </main>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <p className="text-sm text-slate-600">Loading login...</p>
        </main>
      }
    >
      <PortalLoginForm />
    </Suspense>
  );
}
