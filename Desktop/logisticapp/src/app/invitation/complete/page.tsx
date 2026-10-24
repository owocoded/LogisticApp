import Link from "next/link";

export default function InvitationCompletePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Invitation accepted
        </h1>

        <p className="mt-3 leading-7 text-slate-600">
          Your email has been verified and your invitation has been accepted.
          Set a password to access your assigned portal.
        </p>

        <p className="mt-3 leading-7 text-slate-600">
          After setting your password, you will be directed to your merchant or
          rider dashboard to complete the required onboarding steps.
          Administrator approval may be required before you can operate.
        </p>

        <div className="mt-7">
          <Link
            href="/portal/set-password"
            className="inline-flex w-full items-center justify-center rounded-lg bg-violet-600 px-5 py-3 font-medium text-white transition hover:bg-violet-700"
          >
            Set your password
          </Link>
        </div>
      </section>
    </main>
  );
}
