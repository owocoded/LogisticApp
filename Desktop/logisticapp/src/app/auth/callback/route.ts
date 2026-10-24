import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  const supabase = await createClient();

  // Verify new invitation links on the server.
  if (tokenHash || type) {
    if (!tokenHash || type !== "invite") {
      return NextResponse.redirect(
        new URL("/admin/login?error=invalid_invitation_link", origin),
      );
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "invite",
    });

    if (verifyError) {
      return NextResponse.redirect(
        new URL("/admin/login?error=invitation_link_invalid", origin),
      );
    }
  } else if (code) {
    // Preserve compatibility with existing PKCE callback links.
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return NextResponse.redirect(
        new URL("/admin/login?error=invitation_link_invalid", origin),
      );
    }
  } else {
    return NextResponse.redirect(
      new URL("/admin/login?error=missing_auth_code", origin),
    );
  }

  // Confirm the session belongs to an authenticated user with a verified email.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email_confirmed_at) {
    await supabase.auth.signOut();

    return NextResponse.redirect(
      new URL("/admin/login?error=email_not_verified", origin),
    );
  }

  // Finalize the invitation using the current user's session.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return NextResponse.redirect(
      new URL("/admin/login?error=session_unavailable", origin),
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.redirect(
      new URL("/admin/login?error=configuration_error", origin),
    );
  }

  let finalizeResponse: Response;

  try {
    finalizeResponse = await fetch(
      `${supabaseUrl}/functions/v1/finalize-account-invitation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.redirect(
      new URL("/admin/login?error=invitation_service_unavailable", origin),
    );
  }

  if (!finalizeResponse.ok) {
    const errorCode =
      finalizeResponse.status === 410
        ? "invitation_expired"
        : finalizeResponse.status === 404
          ? "invitation_not_found"
          : "invitation_finalization_failed";

    return NextResponse.redirect(
      new URL(`/admin/login?error=${errorCode}`, origin),
    );
  }

  return NextResponse.redirect(new URL("/invitation/complete", origin));
}
