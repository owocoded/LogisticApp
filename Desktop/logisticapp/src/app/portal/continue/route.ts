import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PortalAccess = {
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

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(
      new URL("/portal/login?error=session_required", origin),
    );
  }

  const { data, error } = await supabase.rpc("get_current_portal_access");

  if (error || !data || typeof data !== "object") {
    console.error(
      "Portal access lookup failed:",
      error?.message ?? "No access data returned",
    );

    return NextResponse.redirect(
      new URL("/portal/login?error=role_verification_failed", origin),
    );
  }

  const access = data as unknown as PortalAccess;

  if (!Array.isArray(access.roles) || access.roles.length !== 1) {
    return NextResponse.redirect(
      new URL("/portal/login?error=role_verification_failed", origin),
    );
  }

  const role = access.roles[0];

  if (role === "admin") {
    return NextResponse.redirect(new URL("/admin", origin));
  }

  if (role === "merchant") {
    const hasActiveMembership =
      Array.isArray(access.merchant_memberships) &&
      access.merchant_memberships.some(
        (membership) => membership.membership_status === "active",
      );

    if (!hasActiveMembership) {
      return NextResponse.redirect(
        new URL("/portal/login?error=unauthorized", origin),
      );
    }

    return NextResponse.redirect(new URL("/merchant/dashboard", origin));
  }

  if (role === "rider") {
    // A missing or pending rider profile must not grant operational
    // permissions. The rider dashboard will handle onboarding status.
    return NextResponse.redirect(new URL("/rider/dashboard", origin));
  }

  return NextResponse.redirect(
    new URL("/portal/login?error=unauthorized", origin),
  );
}
