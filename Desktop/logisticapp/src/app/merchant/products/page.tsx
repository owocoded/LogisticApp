import { Suspense } from "react";
import { connection } from "next/server";
import { requirePortalAccess } from "@/lib/auth/require-portal-access";
import MerchantProducts from "@/components/merchant/merchant-products";

async function MerchantProductsContent() {
  await connection();

  const { access } = await requirePortalAccess("merchant");
  const memberships = access.merchant_memberships.filter(
    (membership) => membership.membership_status === "active",
  );

  return <MerchantProducts memberships={memberships} />;
}

export default function MerchantProductsPage() {
  return (
    <main className="min-w-0">
      <Suspense
        fallback={
          <div className="p-6 text-sm text-slate-600">
            Loading merchant products…
          </div>
        }
      >
        <MerchantProductsContent />
      </Suspense>
    </main>
  );
}
