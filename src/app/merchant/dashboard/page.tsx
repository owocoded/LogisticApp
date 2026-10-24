import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { requirePortalAccess } from "@/lib/auth/require-portal-access";

const statusStyles: Record<string, string> = {
  pending_setup: "bg-amber-50 text-amber-800 ring-amber-200",
  pending_review: "bg-sky-50 text-sky-800 ring-sky-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  suspended: "bg-rose-50 text-rose-800 ring-rose-200",
  rejected: "bg-rose-50 text-rose-800 ring-rose-200",
};

const statusMessages: Record<string, string> = {
  pending_setup: "Complete your business setup before submitting for review.",
  pending_review: "Your business setup is awaiting administrator review.",
  active:
    "Your business is approved. You can manage its operations according to your permissions.",
  suspended:
    "Your business is suspended. Contact an administrator for assistance.",
  rejected:
    "Your business was not approved. Review the feedback or contact an administrator.",
};

export default function MerchantDashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-500">Loading your workspace...</p>
        </main>
      }
    >
      <MerchantDashboardContent />
    </Suspense>
  );
}

async function MerchantDashboardContent() {
  await connection();

  const { user, access } = await requirePortalAccess("merchant");

  const memberships = access.merchant_memberships.filter(
    (membership) => membership.membership_status === "active",
  );

  // const needsSetup = memberships.some(
  //   (membership) => membership.merchant_status === "pending_setup",
  // );

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">
              Merchant workspace
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Overview
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Welcome back, {user.email ?? "merchant"}. Here&apos;s your
              business at a glance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700">
              {(user.email ?? "M").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="max-w-56 truncate text-sm font-medium text-slate-800">
                {user.email ?? "Merchant account"}
              </p>
              <p className="text-xs text-slate-500">Signed-in account</p>
            </div>
          </div>
        </header>

        

        <section className="mt-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Your businesses
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                View your business status and next steps.
              </p>
            </div>
            <span className="text-sm text-slate-500">
              {memberships.length}{" "}
              {memberships.length === 1 ? "business" : "businesses"}
            </span>
          </div>

          {memberships.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-orange-50 text-2xl text-orange-700">
                <span aria-hidden="true">⌂</span>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">
                No active merchant memberships
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Your account does not currently have an active merchant
                membership. If you expected to see a business here, contact your
                administrator.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {memberships.map((membership) => {
                const status = membership.merchant_status;
                const isSetup = status === "pending_setup";

                return (
                  <article
                    key={membership.merchant_id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 sm:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                          Business
                        </p>
                        <h3 className="mt-1 wrap-break text-lg font-bold text-slate-900">
                          {membership.business_name}
                        </h3>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${
                          statusStyles[status] ??
                          "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {statusMessages[status] ??
                        "Your business status requires administrator review."}
                    </p>

                    {isSetup && (
                      <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/70 p-4">
                        <div className="flex items-start gap-3">
                          <span
                            className="mt-0.5 text-orange-700"
                            aria-hidden="true"
                          >
                            !
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              Action required
                            </p>
                            <p className="mt-1 text-sm leading-5 text-slate-600">
                              Complete your store information and branch setup
                              before submitting your business for review.
                            </p>
                          </div>
                        </div>
                        <Link
                          href="/merchant/settings"
                          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-800 transition hover:bg-orange-100"
                        >
                          Continue setup
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <footer className="mt-10 border-t border-slate-200 py-5 text-xs leading-5 text-slate-500">
          Business actions remain subject to your membership permissions and
          administrator approval.
        </footer>
      </div>
    </main>
  );
}
