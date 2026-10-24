"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;

type MerchantDetails = {
  merchant: Row;
  locations: Row[];
  members: Row[];
  products: Row[];
  invitations: Row[];
  audit_history: Row[];
  readiness: {
    active_owners: number;
    total_locations: number;
    active_locations: number;
    total_products: number;
    active_products: number;
    has_active_owner: boolean;
    has_active_location: boolean;
    has_active_product: boolean;
  };
};

type MerchantAction =
  | "submit_for_review"
  | "approve"
  | "reject"
  | "suspend"
  | "reactivate"
  | "reopen";

const ACTION_LABELS: Record<MerchantAction, string> = {
  submit_for_review: "Submit for review",
  approve: "Approve business",
  reject: "Reject application",
  suspend: "Suspend merchant",
  reactivate: "Reactivate merchant",
  reopen: "Reopen as setup",
};

const ACTION_REQUIRES_REASON = new Set<MerchantAction>([
  "reject",
  "suspend",
  "reactivate",
  "reopen",
]);

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function titleCase(value: unknown): string {
  return display(value).replaceAll("_", " ");
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function DataTable({
  columns,
  rows,
}: {
  columns: {
    label: string;
    key: string;
    format?: (value: unknown) => string;
  }[];
  rows: Row[];
}) {
  if (rows.length === 0) {
    return <Empty>No records found.</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-3 py-2 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={display(row.id) === "—" ? index : display(row.id)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="max-w-sm wrap-break-word px-3 py-3 align-top text-slate-700"
                >
                  {column.format
                    ? column.format(row[column.key])
                    : display(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MerchantDetailsClient({
  merchantId,
}: {
  merchantId: string;
}) {
  const [data, setData] = useState<MerchantDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedAction, setSelectedAction] = useState<MerchantAction | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const loadDetails = useCallback(async () => {
    setLoading(true);
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

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !publishableKey) {
        throw new Error("Supabase configuration is missing.");
      }

      const endpoint = new URL(
        `${supabaseUrl}/functions/v1/admin-get-merchant-details`,
      );
      endpoint.searchParams.set("merchant_id", merchantId);

      const response = await fetch(endpoint.toString(), {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: publishableKey,
        },
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : `Unable to load merchant (${response.status}).`,
        );
      }

      if (
        !result?.merchant ||
        !Array.isArray(result.locations) ||
        !Array.isArray(result.members) ||
        !Array.isArray(result.products) ||
        !Array.isArray(result.invitations) ||
        !Array.isArray(result.audit_history) ||
        !result.readiness
      ) {
        throw new Error("The server returned an unexpected response.");
      }

      setData(result as MerchantDetails);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "An unexpected error occurred.",
      );
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  const submitMerchantAction = useCallback(async () => {
    if (!selectedAction || submittingAction) return;

    if (
      ACTION_REQUIRES_REASON.has(selectedAction) &&
      reason.trim().length < 5
    ) {
      setActionError("Enter a reason of at least 5 characters.");
      return;
    }

    if (reason.trim().length > 1000) {
      setActionError("The reason cannot exceed 1000 characters.");
      return;
    }

    setSubmittingAction(true);
    setActionError("");
    setActionMessage("");

    try {
      const supabase = createClient();

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !publishableKey) {
        throw new Error("Supabase configuration is missing.");
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/admin-manage-merchant`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: publishableKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            merchant_id: merchantId,
            action: selectedAction,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          }),
        },
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : `Unable to update merchant (${response.status}).`,
        );
      }

      setActionMessage(
        `${ACTION_LABELS[selectedAction]} completed successfully.`,
      );
      setSelectedAction(null);
      setReason("");

      await loadDetails();
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "An unexpected error occurred.",
      );
    } finally {
      setSubmittingAction(false);
    }
  }, [selectedAction, submittingAction, reason, merchantId, loadDetails]);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      if (!cancelled) void loadDetails();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadDetails]);

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <p className="text-sm text-slate-500">Loading merchant details...</p>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="mx-auto max-w-7xl space-y-4 p-6">
        <Link
          href="/admin/merchants"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          ← Back to merchants
        </Link>

        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <p>{error}</p>

          <button
            type="button"
            onClick={() => void loadDetails()}
            className="mt-3 font-semibold underline"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const merchant = data.merchant;
  const readiness = data.readiness;

  const checks = [
    {
      label: "Active owner",
      ready: readiness.has_active_owner,
    },
    {
      label: "Active location",
      ready: readiness.has_active_location,
    },
    {
      label: "Active product",
      ready: readiness.has_active_product,
    },
  ];

  const openAction = (action: MerchantAction) => {
    setSelectedAction(action);
    setReason("");
    setActionError("");
    setActionMessage("");
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/merchants"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          ← Back to merchants
        </Link>

        <button
          type="button"
          onClick={() => void loadDetails()}
          disabled={loading || submittingAction}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-700">
              Merchant management
            </p>

            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {display(merchant.business_name)}
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Merchant ID: {display(merchant.id)}
            </p>
          </div>

          <span className="inline-flex rounded-full bg-violet-50 px-3 py-1.5 text-sm font-semibold capitalize text-violet-800">
            {titleCase(merchant.status)}
          </span>
        </div>

        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Phone
            </p>
            <p className="mt-1 wrap-break text-sm text-slate-800">
              {display(merchant.business_phone)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Email
            </p>
            <p className="mt-1 wrap-break text-sm text-slate-800">
              {display(merchant.business_email)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Created
            </p>
            <p className="mt-1 text-sm text-slate-800">
              {formatDate(merchant.created_at)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Last updated
            </p>
            <p className="mt-1 text-sm text-slate-800">
              {formatDate(merchant.updated_at)}
            </p>
          </div>
        </div>
      </header>

      <Section title="Merchant workflow">
        <p className="mb-4 text-sm text-slate-600">
          Use the actions available for the current status. The server validates
          every transition and records successful changes in the audit history.
          Business approval does not automatically make the storefront
          orderable.
        </p>

        <div className="flex flex-wrap gap-2">
          {merchant.status === "pending_setup" && (
            <button
              type="button"
              onClick={() => openAction("submit_for_review")}
              disabled={submittingAction}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              Submit for review
            </button>
          )}

          {merchant.status === "pending_review" && (
            <>
              <button
                type="button"
                onClick={() => openAction("approve")}
                disabled={submittingAction}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Approve business
              </button>

              <button
                type="button"
                onClick={() => openAction("reject")}
                disabled={submittingAction}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Reject application
              </button>
            </>
          )}

          {merchant.status === "active" && (
            <button
              type="button"
              onClick={() => openAction("suspend")}
              disabled={submittingAction}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Suspend merchant
            </button>
          )}

          {merchant.status === "suspended" && (
            <button
              type="button"
              onClick={() => openAction("reactivate")}
              disabled={submittingAction}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Reactivate merchant
            </button>
          )}

          {merchant.status === "rejected" && (
            <button
              type="button"
              onClick={() => openAction("reopen")}
              disabled={submittingAction}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              Reopen as setup
            </button>
          )}
        </div>

        {actionMessage && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {actionMessage}
          </p>
        )}

        {actionError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {actionError}
          </p>
        )}

        {selectedAction && (
          <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <h3 className="font-semibold text-slate-900">
              Confirm: {ACTION_LABELS[selectedAction]}
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              {selectedAction === "submit_for_review" &&
                "The server will check that the merchant has an active owner and a configured active location."}

              {selectedAction === "approve" &&
                "This approves the business. Products are not required for approval."}

              {selectedAction === "reject" &&
                "Reject this application and record the reason in the audit history."}

              {selectedAction === "suspend" &&
                "This suspends the merchant. Customer-facing ordering must also enforce the merchant status."}

              {selectedAction === "reactivate" &&
                "The server will recheck owner and location requirements before reactivation."}

              {selectedAction === "reopen" &&
                "This returns the rejected merchant to setup so onboarding can resume."}
            </p>

            {ACTION_REQUIRES_REASON.has(selectedAction) && (
              <label className="mt-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-800">
                  Reason (required)
                </span>

                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  required
                  placeholder="Explain why this action is being taken..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                />

                <span className="mt-1 block text-xs text-slate-500">
                  {reason.length}/1000 characters; enter at least 5.
                </span>
              </label>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submitMerchantAction()}
                disabled={
                  submittingAction ||
                  (ACTION_REQUIRES_REASON.has(selectedAction) &&
                    reason.trim().length < 5) ||
                  reason.trim().length > 1000
                }
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingAction ? "Processing..." : "Confirm action"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedAction(null);
                  setReason("");
                  setActionError("");
                }}
                disabled={submittingAction}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Storefront readiness">
        <p className="mb-4 text-sm text-slate-600">
          Business approval and storefront orderability are separate. These
          checks summarize the data returned by the server; they do not approve
          or activate the merchant.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((check) => (
            <div
              key={check.label}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
            >
              <span className="text-sm font-medium text-slate-800">
                {check.label}
              </span>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  check.ready
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {check.ready ? "Ready" : "Incomplete"}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Active owners", readiness.active_owners],
            ["Locations", readiness.total_locations],
            ["Active locations", readiness.active_locations],
            ["Active products", readiness.active_products],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Total products reported: {readiness.total_products}. Confirm
          storefront readiness on the server when implementing customer listings
          and checkout.
        </p>
      </Section>

      <Section title={`Locations (${data.locations.length})`}>
        <DataTable
          rows={data.locations}
          columns={[
            { label: "Name", key: "location_name" },
            { label: "Address", key: "address_text" },
            { label: "City", key: "city" },
            { label: "State", key: "state_region" },
            { label: "Country", key: "country_code" },
            {
              label: "Active",
              key: "is_active",
              format: (value) => (value === true ? "Yes" : "No"),
            },
          ]}
        />
      </Section>

      <Section title={`Team members (${data.members.length})`}>
        <DataTable
          rows={data.members}
          columns={[
            { label: "User ID", key: "user_id" },
            { label: "Role", key: "member_role", format: titleCase },
            { label: "Membership", key: "status", format: titleCase },
            {
              label: "Created",
              key: "created_at",
              format: formatDate,
            },
          ]}
        />
      </Section>

      <Section title={`Products (${data.products.length} returned)`}>
        <DataTable
          rows={data.products}
          columns={[
            { label: "Product", key: "name" },
            {
              label: "Price",
              key: "price_minor",
              format: (value) => {
                if (typeof value !== "number" && typeof value !== "string") {
                  return "—";
                }

                const amount = Number(value);

                if (!Number.isFinite(amount)) return "—";

                return `${(amount / 100).toLocaleString("en-NG", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} ${display(
                  data.products.find((product) => product.price_minor === value)
                    ?.currency,
                )}`;
              },
            },
            { label: "Status", key: "status", format: titleCase },
            {
              label: "Preparation (min)",
              key: "preparation_time_minutes",
            },
            { label: "Location ID", key: "location_id" },
          ]}
        />

        <p className="mt-3 text-xs text-slate-500">
          The current endpoint returns at most 100 products. If this merchant
          has a larger catalog, the displayed count is the number returned, not
          necessarily the full catalog total.
        </p>
      </Section>

      <Section title={`Invitations (${data.invitations.length})`}>
        <DataTable
          rows={data.invitations}
          columns={[
            { label: "Invitation ID", key: "id" },
            { label: "Role", key: "intended_role", format: titleCase },
            { label: "Status", key: "status", format: titleCase },
            {
              label: "Created",
              key: "created_at",
              format: formatDate,
            },
            {
              label: "Expires",
              key: "expires_at",
              format: formatDate,
            },
            {
              label: "Redeemed",
              key: "redeemed_at",
              format: formatDate,
            },
          ]}
        />
      </Section>

      <Section title={`Audit history (${data.audit_history.length} returned)`}>
        {data.audit_history.length === 0 ? (
          <Empty>No audit entries found for this merchant.</Empty>
        ) : (
          <div className="space-y-3">
            {data.audit_history.map((entry, index) => (
              <article
                key={display(entry.id) === "—" ? index : display(entry.id)}
                className="rounded-lg border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {titleCase(entry.action)}
                  </p>

                  <time className="text-xs text-slate-500">
                    {formatDate(entry.created_at)}
                  </time>
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Actor: {display(entry.actor_user_id)}
                </p>

                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-word rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(entry.details ?? {}, null, 2)}
                </pre>
              </article>
            ))}
          </div>
        )}
      </Section>
    </main>
  );
}