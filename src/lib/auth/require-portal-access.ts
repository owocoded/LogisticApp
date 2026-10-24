import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PortalAccess = {
  roles: string[];
  merchant_memberships: {
    merchant_id: string;
    membership_status: string;
    merchant_status: string;
    business_name: string;
  }[];
  rider_profile: {
    verification_status: string;
    activation_status: string;
  } | null;
};

export async function requirePortalAccess(expectedRole: "merchant" | "rider") {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/portal/login?error=session_required");
  }

  const { data, error } = await supabase.rpc("get_current_portal_access");

  if (error || !data || typeof data !== "object") {
    console.error(
      "Portal access check failed:",
      error?.message ?? "No access data returned",
    );

    redirect("/portal/login?error=role_verification_failed");
  }

  const access = data as unknown as PortalAccess;

  if (!Array.isArray(access.roles) || access.roles.length !== 1) {
    redirect("/portal/login?error=role_verification_failed");
  }

  if (access.roles[0] !== expectedRole) {
    redirect("/portal/login?error=unauthorized");
  }

  if (expectedRole === "merchant") {
    const memberships = access.merchant_memberships;

    if (
      !Array.isArray(memberships) ||
      !memberships.some(
        (membership) => membership.membership_status === "active",
      )
    ) {
      redirect("/portal/login?error=unauthorized");
    }
  }

  return { user, access };
}
