import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import InvitationForm from "./invitation-form";
import AdminSidebar from "../Adminsidebar";

export default function AdminInvitationsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-600">Loading invitations page...</p>
        </main>
      }
    >
      <AdminInvitationsContent />
    </Suspense>
  );
}

async function AdminInvitationsContent() {
  await connection();
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar />
      <main className="min-w-0 pt-16 lg:ml-64 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">
              Administration
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Account invitations
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Invite merchants and riders to set up their accounts. Invitation
              links must be shared privately.
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
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <InvitationForm />
          </section>
        </div>
      </main>
    </div>
  );
}
