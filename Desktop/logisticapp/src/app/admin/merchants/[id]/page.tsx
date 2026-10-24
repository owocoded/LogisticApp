import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import MerchantDetailsClient from "./merchant-details-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function MerchantDetailsContent({ params }: PageProps) {
  await connection();
  await requireAdmin();

  const { id } = await params;

  return <MerchantDetailsClient merchantId={id} />;
}

export default function MerchantDetailsPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-7xl p-6">
          <p className="text-sm text-slate-500">Loading merchant page...</p>
        </main>
      }
    >
      <MerchantDetailsContent params={params} />
    </Suspense>
  );
}
