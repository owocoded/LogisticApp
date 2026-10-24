import { Suspense } from "react";
import { connection } from "next/server";
import { requirePortalAccess } from "@/lib/auth/require-portal-access";
import StoreSettings from "@/components/merchant/store-settings";

async function MerchantSettingsContent() {
  await connection();

  const { access } = await requirePortalAccess("merchant");

  const memberships = access.merchant_memberships.filter(
    (membership) => membership.membership_status === "active",
  );

  return <StoreSettings memberships={memberships} />;
}

export default function MerchantSettingsPage() {
  return (
    <main className="min-w-0">
      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
            Loading store settings…
          </div>
        }
      >
        <MerchantSettingsContent />
      </Suspense>
    </main>
  );
}
