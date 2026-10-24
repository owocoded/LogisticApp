import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import AdminSidebar from "./Adminsidebar";
import DeliveryAreasPanel from "./DeliveryAreaPanel";

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
            <p className="mt-4 text-sm text-slate-600">
              Loading admin dashboard...
            </p>
          </div>
        </main>
      }
    >
      <AdminDashboardContent />
    </Suspense>
  );
}

async function AdminDashboardContent() {
  await connection();

  // Keep the server-side admin authorization check.
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar />

      <main className="min-w-0 pt-16 lg:ml-64 lg:pt-0">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                <span className="h-2 w-2 rounded-full bg-violet-600" />
                Delivery Marketplace
              </div>

              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                Dashboard overview
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Manage your marketplace, onboarding, delivery areas, and
                administrative operations from one workspace.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-800">
                A
              </div>

              <div className="min-w-0">
                <p className="text-xs text-slate-500">Signed in as</p>
                <p
                  className="max-w-55 truncate text-sm font-semibold text-slate-900"
                  title={user.email ?? undefined}
                >
                  {user.email ?? "Authorized administrator"}
                </p>
              </div>

              <span
                className="ml-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                title="The server has authorized this admin page"
              >
                Admin
              </span>
            </div>
          </header>

          <section
            aria-label="Dashboard summary"
            className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Access status
                  </p>
                  <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
                    Authorized
                  </p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-xl text-green-700">
                  ✓
                </span>
              </div>
            </article>
          </section>
          <section className="mt-9">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <DeliveryAreasPanel />
            </div>
          </section>

          <footer className="mt-10 flex flex-col gap-2 border-t border-slate-200 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Logistic Marketplace Administration</p>
            <p>Administrative access is restricted to authorized users.</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
