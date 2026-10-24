import { Suspense } from "react";
import { connection } from "next/server";
import MerchantDirectory from "./merchant-directory";
import AdminSidebar from "../Adminsidebar";
import { requireAdmin } from "@/lib/auth/require-admin";
export default function AdminMerchantsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl p-6">
          <p className="text-slate-600">Loading merchant management...</p>
        </main>
      }
    >
      <AdminMerchantsContent />
    </Suspense>
  );
}

async function AdminMerchantsContent() {
  await connection();
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar />
      <main className="min-w-0 pt-16 lg:ml-64 lg:pt-0">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
                Merchant Management
              </h1>
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
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">
              Existing merchants
            </h2>

            <MerchantDirectory />
          </section>
        </div>
      </main>
    </div>
  );
}
