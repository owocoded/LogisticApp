import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import RidersPanel from "./RidersPanel";
import AdminSideBar from "../Adminsidebar";

async function AdminRidersContent() {
  await connection();
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSideBar />
      <main className="min-w-0 pt-16 lg:ml-64 lg:pt-0">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">
                Administration
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                Rider management
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Review registered rider profiles, verification progress, vehicle
                details, and current activation status.
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
            </div>
          </div>
          <RidersPanel />
        </div>
      </main>
    </div>
  );
}

export default function AdminRidersPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm text-slate-500">
              Loading rider management...
            </p>
          </div>
        </main>
      }
    >
      <AdminRidersContent />
    </Suspense>
  );
}
