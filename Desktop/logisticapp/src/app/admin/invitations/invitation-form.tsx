"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Merchant = {
  id: string;
  business_name: string;
  status: string;
};

type MerchantListResponse = {
  merchants: Merchant[];
  pagination?: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

type InvitationResponse = {
  invitation_id: string;
  user_id?: string;
  email: string;
  role: "merchant" | "rider";
  merchant_id: string | null;
  expires_at: string;
  setup_link?: string;
  action_link?: string;
  message?: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export default function InvitationForm() {
  const [role, setRole] = useState<"merchant" | "rider">("merchant");
  const [email, setEmail] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [invitation, setInvitation] = useState<InvitationResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const loadMerchants = useCallback(async () => {
    setLoadingMerchants(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Supabase configuration is missing.");
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-listing-merchants?page=1&page_size=50`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_KEY,
          },
          cache: "no-store",
        },
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : `Unable to load merchants (${response.status}).`,
        );
      }

      if (!result || !Array.isArray(result.merchants)) {
        throw new Error("Unexpected merchant-list response.");
      }

      const list = (result as MerchantListResponse).merchants;
      setMerchants(list);

      if (merchantId && !list.some((merchant) => merchant.id === merchantId)) {
        setMerchantId("");
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load merchants.",
      );
    } finally {
      setLoadingMerchants(false);
    }
  }, [merchantId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadMerchants();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadMerchants]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setInvitation(null);
    setCopied(false);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter the invitee's email address.");
      return;
    }

    if (role === "merchant" && !merchantId) {
      setError("Select a merchant for this invitation.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Supabase configuration is missing.");
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/Admin-create-invitation`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            intended_role: role,
            ...(role === "merchant" ? { merchant_id: merchantId } : {}),
          }),
          cache: "no-store",
        },
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : `Invitation creation failed (${response.status}).`,
        );
      }

      if (
        !result ||
        typeof result.invitation_id !== "string" ||
        typeof result.email !== "string" ||
        typeof result.role !== "string" ||
        typeof result.expires_at !== "string" ||
        (!result.setup_link && !result.action_link)
      ) {
        throw new Error(
          "The server response did not contain all required invitation details. Check the invitation in Supabase before retrying.",
        );
      }

      setInvitation(result as InvitationResponse);
      setSuccess(
        "Invitation created. Share the link privately with the invitee.",
      );
      setEmail("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "An unexpected error occurred.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInvitationLink() {
    const link = invitation?.setup_link ?? invitation?.action_link;

    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError(
        "Automatic copying failed. Select and copy the invitation link manually.",
      );
    }
  }

  function formatExpiry(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Create an invitation
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Invitations expire after the configured validity period. This form
          does not send an email automatically.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="invitation-role"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Account type
          </label>
          <select
            id="invitation-role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as "merchant" | "rider");
              setInvitation(null);
              setSuccess("");
              setError("");
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            <option value="merchant">Merchant</option>
            <option value="rider">Rider</option>
          </select>
        </div>

        {role === "merchant" && (
          <div>
            <label
              htmlFor="invitation-merchant"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Merchant
            </label>
            <select
              id="invitation-merchant"
              value={merchantId}
              onChange={(event) => {
                setMerchantId(event.target.value);
                setInvitation(null);
                setSuccess("");
              }}
              required
              disabled={loadingMerchants || submitting}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
            >
              <option value="">
                {loadingMerchants
                  ? "Loading merchants..."
                  : "Select a merchant"}
              </option>
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.business_name} —{" "}
                  {merchant.status.replaceAll("_", " ")}
                </option>
              ))}
            </select>

            {!loadingMerchants && merchants.length === 0 && !error && (
              <p className="mt-2 text-sm text-amber-700">
                No merchants were returned. Refresh the page or check your admin
                access and merchant-list function.
              </p>
            )}

            <button
              type="button"
              onClick={() => void loadMerchants()}
              disabled={loadingMerchants || submitting}
              className="mt-2 text-sm font-medium text-violet-700 underline disabled:opacity-50"
            >
              Refresh merchant list
            </button>
          </div>
        )}

        <div>
          <label
            htmlFor="invitation-email"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Invitee email address
          </label>
          <input
            id="invitation-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            disabled={submitting}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
          />
        </div>

        <button
          type="submit"
          disabled={
            submitting ||
            loadingMerchants ||
            (role === "merchant" && !merchantId)
          }
          className="w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating invitation..." : "Create invitation"}
        </button>
      </form>

      {invitation && (
        <section
          aria-labelledby="invitation-result-heading"
          className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <div>
            <h3
              id="invitation-result-heading"
              className="font-semibold text-slate-900"
            >
              Invitation created
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {invitation.email} · {invitation.role}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Expires: {formatExpiry(invitation.expires_at)}
            </p>
          </div>

          <div>
            <label
              htmlFor="invitation-link"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Private onboarding link
            </label>
            <textarea
              id="invitation-link"
              readOnly
              rows={3}
              value={invitation.setup_link ?? invitation.action_link ?? ""}
              className="w-full break-all rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800"
            />
            <button
              type="button"
              onClick={() => void copyInvitationLink()}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              {copied ? "Copied" : "Copy invitation link"}
            </button>
          </div>

          <p className="text-sm leading-6 text-amber-800">
            Treat this link like a credential. Share it only with the intended
            recipient through a private channel. Do not post it publicly.
          </p>

          <button
            type="button"
            onClick={() => {
              setInvitation(null);
              setSuccess("");
              setCopied(false);
            }}
            className="text-sm font-medium text-slate-600 underline"
          >
            Close invitation details
          </button>
        </section>
      )}
    </div>
  );
}
