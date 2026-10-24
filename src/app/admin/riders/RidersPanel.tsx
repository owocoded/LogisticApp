"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type VerificationStatus = "pending" | "under_review" | "approved" | "rejected";

type ActivationStatus = "inactive" | "active" | "suspended";

type Rider = {
  id: string;
  user_id: string;
  email: string | null;
  verification_status: VerificationStatus;
  activation_status: ActivationStatus;
  is_online: boolean;
  vehicle_type: string | null;
  vehicle_registration: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type VerificationAction = "under_review" | "approved" | "rejected";
type ActivationAction = "active" | "inactive" | "suspended";

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClasses(value: string) {
  switch (value) {
    case "approved":
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "under_review":
      return "bg-amber-50 text-amber-700";
    case "rejected":
    case "suspended":
      return "bg-red-50 text-red-700";
    case "pending":
    case "inactive":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function getErrorMessage(err: unknown) {
  if (err && typeof err === "object" && "message" in err) {
    return String(err.message);
  }

  return "An unexpected error occurred. Please try again.";
}

export default function RidersPanel() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const loadRiders = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("admin_list_riders");

      if (rpcError) throw rpcError;

      setRiders((data ?? []) as Rider[]);
      setError("");
    } catch (err) {
      console.error("Loading rider profiles failed:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadRiders();
    });
  }, [loadRiders]);

  const updateVerification = async (
    rider: Rider,
    status: VerificationAction,
  ) => {
    if (processingId !== null) return;

    if (rider.verification_status === "rejected" && status === "approved") {
      setActionError(
        "A rejected application cannot be approved directly. Reopen it for review first.",
      );
      return;
    }

    if (
      status === "rejected" &&
      !window.confirm(
        `Reject the rider application for ${
          rider.email || rider.user_id
        }? This will set the rider offline and inactive.`,
      )
    ) {
      return;
    }

    const actionLabel =
      status === "under_review"
        ? "move this rider to review"
        : status === "approved"
          ? "approve this rider"
          : "reject this rider";

    if (
      status === "approved" &&
      !window.confirm(
        `Are you sure you want to approve ${
          rider.email || rider.user_id
        }? Approval will not activate the rider.`,
      )
    ) {
      return;
    }

    if (
      status === "under_review" &&
      rider.verification_status === "rejected" &&
      !window.confirm(
        `Reopen the rejected application for ${rider.email || rider.user_id}?`,
      )
    ) {
      return;
    }

    setProcessingId(rider.id);
    setActionError("");
    setActionSuccess("");

    try {
      const supabase = createClient();

      const { error: rpcError } = await supabase.rpc(
        "admin_set_rider_verification",
        {
          p_rider_profile_id: rider.id,
          p_verification_status: status,
        },
      );

      if (rpcError) throw rpcError;

      setActionSuccess(`Successfully completed: ${actionLabel}.`);

      await loadRiders(true);
    } catch (err) {
      console.error("Rider verification update failed:", err);
      setActionError(getErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  };

  const updateActivation = async (rider: Rider, status: ActivationAction) => {
    if (processingId !== null) return;

    if (status === "active" && rider.verification_status !== "approved") {
      setActionError("Only approved riders can be activated.");
      return;
    }

    const actionLabel =
      status === "active"
        ? "activate"
        : status === "inactive"
          ? "deactivate"
          : "suspend";

    const riderLabel = rider.email || rider.user_id;

    const confirmationMessage =
      status === "active"
        ? `Activate ${riderLabel}? The rider will remain offline until they explicitly go online.`
        : status === "inactive"
          ? `Deactivate ${riderLabel}? This will force the rider offline.`
          : `Suspend ${riderLabel}? This will force the rider offline and prevent activation until the suspension is removed.`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setProcessingId(rider.id);
    setActionError("");
    setActionSuccess("");

    try {
      const supabase = createClient();

      const { data, error: rpcError } = await supabase.rpc(
        "admin_set_rider_activation",
        {
          p_rider_profile_id: rider.id,
          p_activation_status: status,
        },
      );

      if (rpcError) throw rpcError;

      if (!data || data.success !== true) {
        throw new Error("The activation update was not confirmed.");
      }

      setActionSuccess(`Successfully ${actionLabel}d rider: ${riderLabel}.`);

      await loadRiders(true);
    } catch (err) {
      console.error("Rider activation update failed:", err);
      setActionError(getErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  };

  const onlineCount = riders.filter((rider) => rider.is_online).length;

  const pendingCount = riders.filter(
    (rider) =>
      rider.verification_status === "pending" ||
      rider.verification_status === "under_review",
  ).length;

  const activeCount = riders.filter(
    (rider) => rider.activation_status === "active",
  ).length;

  const approvedCount = riders.filter(
    (rider) => rider.verification_status === "approved",
  ).length;

  const suspendedCount = riders.filter(
    (rider) => rider.activation_status === "suspended",
  ).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Registered riders
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Review rider applications, manage verification, and control rider
            activation. Approval and activation are separate steps.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRiders(true)}
          disabled={loading || refreshing || processingId !== null}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : "Refresh riders"}
        </button>
      </div>

      {actionSuccess && (
        <div
          role="status"
          className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {actionSuccess}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm font-semibold text-red-800">
            Rider action failed
          </p>
          <p className="mt-1 break-words text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Total profiles</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {riders.length}
            </p>
          </div>

          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-sm text-amber-800">Awaiting review</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">
              {pendingCount}
            </p>
          </div>

          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">Approved</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">
              {approvedCount}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Active / online</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {activeCount} / {onlineCount}
            </p>
          </div>

          <div className="rounded-xl bg-red-50 p-4">
            <p className="text-sm text-red-800">Suspended</p>
            <p className="mt-1 text-2xl font-bold text-red-900">
              {suspendedCount}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm font-semibold text-red-800">
            Could not load riders.
          </p>
          <p className="mt-1 break-words text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadRiders()}
            disabled={processingId !== null}
            className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading rider profiles...</p>
      ) : !error && riders.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <h3 className="font-semibold text-slate-900">
            No rider profiles found
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            No registered rider profiles were returned. Users with the rider
            role but without a rider profile will not appear here.
          </p>
        </div>
      ) : !error ? (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[1150px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Rider</th>
                <th className="px-4 py-3 font-semibold">Verification</th>
                <th className="px-4 py-3 font-semibold">Activation</th>
                <th className="px-4 py-3 font-semibold">Availability</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Registered</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {riders.map((rider) => {
                const isProcessing = processingId === rider.id;

                const canReview =
                  rider.verification_status === "pending" ||
                  rider.verification_status === "under_review";

                return (
                  <tr key={rider.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-900">
                        {rider.email || "Email unavailable"}
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-500">
                        ID: {rider.user_id}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(
                          rider.verification_status,
                        )}`}
                      >
                        {formatStatus(rider.verification_status)}
                      </span>

                      {rider.approved_at && (
                        <p className="mt-2 text-xs text-slate-500">
                          Approved {formatDate(rider.approved_at)}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(
                          rider.activation_status,
                        )}`}
                      >
                        {formatStatus(rider.activation_status)}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          rider.is_online
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {rider.is_online ? "Online" : "Offline"}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-800">
                        {rider.vehicle_type
                          ? formatStatus(rider.vehicle_type)
                          : "Not provided"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {rider.vehicle_registration || "No registration"}
                      </p>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                      {formatDate(rider.created_at)}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex min-w-40 flex-col items-start gap-2">
                        {rider.verification_status === "pending" && (
                          <button
                            type="button"
                            disabled={processingId !== null}
                            onClick={() =>
                              void updateVerification(rider, "under_review")
                            }
                            className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isProcessing ? "Processing..." : "Move to review"}
                          </button>
                        )}

                        {canReview && (
                          <>
                            <button
                              type="button"
                              disabled={processingId !== null}
                              onClick={() =>
                                void updateVerification(rider, "approved")
                              }
                              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isProcessing ? "Processing..." : "Approve"}
                            </button>

                            <button
                              type="button"
                              disabled={processingId !== null}
                              onClick={() =>
                                void updateVerification(rider, "rejected")
                              }
                              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {rider.verification_status === "rejected" && (
                          <button
                            type="button"
                            disabled={processingId !== null}
                            onClick={() =>
                              void updateVerification(rider, "under_review")
                            }
                            className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isProcessing ? "Processing..." : "Reopen review"}
                          </button>
                        )}

                        {rider.verification_status === "approved" && (
                          <>
                            <span className="text-xs text-slate-500">
                              Verification complete
                            </span>

                            {rider.activation_status !== "active" && (
                              <button
                                type="button"
                                disabled={processingId !== null}
                                onClick={() =>
                                  void updateActivation(rider, "active")
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isProcessing
                                  ? "Processing..."
                                  : "Activate rider"}
                              </button>
                            )}

                            {rider.activation_status === "active" && (
                              <>
                                <button
                                  type="button"
                                  disabled={processingId !== null}
                                  onClick={() =>
                                    void updateActivation(rider, "inactive")
                                  }
                                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isProcessing
                                    ? "Processing..."
                                    : "Deactivate"}
                                </button>

                                <button
                                  type="button"
                                  disabled={processingId !== null}
                                  onClick={() =>
                                    void updateActivation(rider, "suspended")
                                  }
                                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isProcessing
                                    ? "Processing..."
                                    : "Suspend rider"}
                                </button>
                              </>
                            )}

                            {rider.activation_status === "suspended" && (
                              <>
                                <span className="text-xs font-medium text-red-700">
                                  Rider suspended
                                </span>

                                <button
                                  type="button"
                                  disabled={processingId !== null}
                                  onClick={() =>
                                    void updateActivation(rider, "inactive")
                                  }
                                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isProcessing
                                    ? "Processing..."
                                    : "Remove suspension"}
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !error && riders.length > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          Showing {riders.length} rider profile
          {riders.length === 1 ? "" : "s"}. Verification and activation actions
          are processed by secured database functions. Activation does not
          automatically put a rider online.
        </p>
      )}
    </section>
  );
}