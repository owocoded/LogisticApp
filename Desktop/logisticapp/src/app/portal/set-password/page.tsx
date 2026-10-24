"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // Confirm that the invitation session is still valid.
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user || !user.email_confirmed_at) {
        router.replace("/portal/login?error=session_required");
        return;
      }

      // Set the password for the authenticated account.
      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      });

      if (passwordError) {
        setError(passwordError.message);
        return;
      }

      // Revalidate the invitation and retrieve the assigned role.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setError(
          "Your password was saved, but we could not verify your portal access. Please sign in.",
        );
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !publishableKey) {
        setError(
          "Your password was saved, but portal verification is unavailable. Please sign in.",
        );
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/finalize-account-invitation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: publishableKey,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setError(
          "Your password was saved, but we could not verify your portal access. Please sign in or contact an administrator.",
        );
        return;
      }

      const result = await response.json();

      if (result.status !== "redeemed") {
        setError(
          "Your password was saved, but your invitation could not be verified. Please contact an administrator.",
        );
        return;
      }

      if (result.role === "merchant") {
        router.replace("/merchant/dashboard");
      } else if (result.role === "rider") {
        router.replace("/rider/dashboard");
      } else {
        setError(
          "Your account does not have a supported portal role. Please contact an administrator.",
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Set your password
        </h1>

        <p className="mt-3 leading-7 text-slate-600">
          Create a password for your merchant or rider portal account.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
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
            {loading ? "Setting password..." : "Set password"}
          </button>
        </form>
      </section>
    </main>
  );
}
