"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RiderSidebar } from "@/components/rider/rider-sidebar";

const summaryCards = [
  {
    title: "Today's deliveries",
    value: "—",
    description: "Awaiting backend connection",
    icon: "▤",
  },
  {
    title: "Completed deliveries",
    value: "—",
    description: "Awaiting backend connection",
    icon: "✓",
  },
  {
    title: "Today's earnings",
    value: "—",
    description: "Awaiting backend connection",
    icon: "₦",
  },
];

type RiderProfile = {
  verificationStatus: "pending" | "under_review" | "approved" | "rejected";
  activationStatus: "inactive" | "active" | "suspended";
  isOnline: boolean;
};

type PortalAccess = {
  roles: unknown;
  rider_profile: unknown;
};

type ProfileState = "loading" | "ready" | "missing" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVerificationStatus(
  value: unknown,
): value is RiderProfile["verificationStatus"] {
  return (
    value === "pending" ||
    value === "under_review" ||
    value === "approved" ||
    value === "rejected"
  );
}

function isActivationStatus(
  value: unknown,
): value is RiderProfile["activationStatus"] {
  return value === "inactive" || value === "active" || value === "suspended";
}

function verificationLabel(status: RiderProfile["verificationStatus"]) {
  switch (status) {
    case "pending":
      return "Pending review";
    case "under_review":
      return "Under review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
  }
}

function activationLabel(status: RiderProfile["activationStatus"]) {
  switch (status) {
    case "inactive":
      return "Inactive";
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
  }
}

export default function RiderDashboardPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState>("loading");
  const [riderProfile, setRiderProfile] = useState<RiderProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [onlineUpdating, setOnlineUpdating] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [onlineMessage, setOnlineMessage] = useState("");
  const [gpsState, setGpsState] = useState<
    "idle" | "requesting" | "sharing" | "error"
  >("idle");

  const [gpsMessage, setGpsMessage] = useState("");
  const [lastGpsUpdate, setLastGpsUpdate] = useState<string | null>(null);

  const gpsRequestInFlight = useRef(false);

  const router = useRouter();

  const loadRiderProfile = useCallback(async () => {
    setProfileState("loading");
    setProfileError("");

    try {
      const supabase = createClient();

      const { data: accessData, error: accessError } = await supabase.rpc(
        "get_current_portal_access",
      );

      if (accessError) {
        console.error("Unable to load rider portal access:", accessError);
        setProfileError(
          "We could not verify your rider account. Please try again.",
        );
        setProfileState("error");
        return;
      }

      if (!isRecord(accessData)) {
        setProfileError(
          "Your account access could not be verified. Please sign in again.",
        );
        setProfileState("error");
        return;
      }

      const access = accessData as unknown as PortalAccess;

      if (
        !Array.isArray(access.roles) ||
        access.roles.length !== 1 ||
        access.roles[0] !== "rider"
      ) {
        router.replace("/portal/login?error=unauthorized");
        return;
      }

      if (access.rider_profile === null) {
        setRiderProfile(null);
        setProfileState("missing");
        return;
      }

      if (!isRecord(access.rider_profile)) {
        setProfileError(
          "Your rider profile returned an unexpected response. Please contact support.",
        );
        setProfileState("error");
        return;
      }

      const verificationStatus = access.rider_profile.verification_status;
      const activationStatus = access.rider_profile.activation_status;

      if (
        !isVerificationStatus(verificationStatus) ||
        !isActivationStatus(activationStatus)
      ) {
        setProfileError(
          "Your rider status could not be validated. Please contact support.",
        );
        setProfileState("error");
        return;
      }

      // Load the authoritative current online status through the secured RPC.
      const { data: profileData, error: profileError } = await supabase.rpc(
        "get_my_rider_profile",
      );

      if (profileError) {
        console.error("Unable to load current rider profile:", profileError);
        setProfileError(
          "We could not load your current online status. Please try again.",
        );
        setProfileState("error");
        return;
      }

      if (
        !isRecord(profileData) ||
        typeof profileData.is_online !== "boolean"
      ) {
        setProfileError(
          "Your online status could not be validated. Please contact support.",
        );
        setProfileState("error");
        return;
      }

      // Use the status RPC as the source of truth for operational eligibility.
      const currentVerification = profileData.verification_status;
      const currentActivation = profileData.activation_status;

      if (
        !isVerificationStatus(currentVerification) ||
        !isActivationStatus(currentActivation)
      ) {
        setProfileError(
          "Your rider status could not be validated. Please contact support.",
        );
        setProfileState("error");
        return;
      }

      setRiderProfile({
        verificationStatus: currentVerification,
        activationStatus: currentActivation,
        isOnline: profileData.is_online,
      });
      setOnlineError("");
      setProfileState("ready");
    } catch (error) {
      console.error("Unexpected rider dashboard error:", error);
      setProfileError(
        "Something went wrong while checking your account. Please try again.",
      );
      setProfileState("error");
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      await loadRiderProfile();
    }

    void load();

    return () => {
      cancelled = true;
      // Avoid unused-variable warnings while ensuring this effect owns its run.
      void cancelled;
    };
  }, [loadRiderProfile]);

  const riderCanOperate =
    profileState === "ready" &&
    riderProfile?.verificationStatus === "approved" &&
    riderProfile?.activationStatus === "active";

  useEffect(() => {
    if (!riderCanOperate || !riderProfile?.isOnline) {
      return;
    }

    let cancelled = false;
    let watchId: number | null = null;

    if (!("geolocation" in navigator)) {
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (cancelled || gpsRequestInFlight.current) return;

        gpsRequestInFlight.current = true;

        void (async () => {
          try {
            const supabase = createClient();

            const { data, error } = await supabase.rpc(
              "update_my_rider_location",
              {
                p_latitude: position.coords.latitude,
                p_longitude: position.coords.longitude,
              },
            );

            if (cancelled) return;

            if (error) {
              console.error("Unable to update rider GPS:", error);
              throw new Error(
                "We couldn't save your location. Please try going offline and online again.",
              );
            }

            if (!isRecord(data) || data.success !== true) {
              throw new Error(
                "The server did not confirm your location update.",
              );
            }

            setGpsState("sharing");
            setGpsMessage("Your GPS location is being shared securely.");
            setLastGpsUpdate(new Date().toLocaleTimeString());
          } catch (error) {
            if (cancelled) return;

            console.error("Rider GPS update failed:", error);

            setGpsState("error");
            setGpsMessage(
              error instanceof Error
                ? error.message
                : "Location sharing failed. Please try again.",
            );

            if (watchId !== null) {
              navigator.geolocation.clearWatch(watchId);
              watchId = null;
            }
          } finally {
            gpsRequestInFlight.current = false;
          }
        })();
      },
      (error) => {
        if (cancelled) return;

        setGpsState("error");

        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGpsMessage(
              "Location permission was denied. Allow location access in your browser settings, then go offline and online again to retry.",
            );
            break;

          case error.POSITION_UNAVAILABLE:
            setGpsMessage(
              "Your current location is unavailable. Check your device's location settings and GPS signal.",
            );
            break;

          case error.TIMEOUT:
            setGpsMessage(
              "Getting your location took too long. Check your GPS signal and try again.",
            );
            break;

          default:
            setGpsMessage("Unable to obtain your GPS location.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      },
    );

    return () => {
      cancelled = true;

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [riderCanOperate, riderProfile?.isOnline]);

  async function updateOnlineStatus(nextOnline: boolean) {
    if (!riderCanOperate || onlineUpdating) return;

    setOnlineUpdating(true);
    setOnlineError("");
    setOnlineMessage("");

    try {
      const supabase = createClient();

      const { data, error } = await supabase.rpc("set_my_rider_online_status", {
        p_is_online: nextOnline,
      });

      if (error) {
        console.error("Unable to update rider online status:", error);
        setOnlineError(
          error.message.includes("Only approved and active riders")
            ? "Your account must be approved and active before you can go online."
            : "We couldn't update your availability. Please try again.",
        );
        return;
      }

      if (
        !isRecord(data) ||
        data.success !== true ||
        data.is_online !== nextOnline
      ) {
        setOnlineError(
          "The server response could not be confirmed. Refresh your status and try again.",
        );
        return;
      }

      setRiderProfile((current) =>
        current
          ? {
              ...current,
              isOnline: nextOnline,
            }
          : current,
      );

      setOnlineMessage(
        nextOnline
          ? "You are online. GPS location permission will be requested."
          : "You are offline. Your current GPS location has been cleared.",
      );
    } catch (error) {
      console.error("Unexpected availability error:", error);
      setOnlineError("Something went wrong. Please try again.");
    } finally {
      setOnlineUpdating(false);
    }
  }

  const accountStatus =
    profileState === "loading"
      ? "Checking account…"
      : profileState === "ready"
        ? "Account verified"
        : profileState === "missing"
          ? "Profile missing"
          : profileState === "error"
            ? "Verification unavailable"
            : "Checking account…";

  let profileHeading = "Checking your rider profile";
  let profileMessage =
    "Verifying your account using the secure portal access function.";
  let profileTone = "border-slate-200 bg-slate-50 text-slate-800";

  if (profileState === "ready" && riderProfile) {
    if (riderProfile.verificationStatus === "rejected") {
      profileHeading = "Verification was rejected";
      profileMessage =
        "Your rider verification was rejected. Please contact support for guidance on the next steps.";
      profileTone = "border-red-200 bg-red-50 text-red-900";
    } else if (riderProfile.activationStatus === "suspended") {
      profileHeading = "Rider account suspended";
      profileMessage =
        "Your account is suspended. Contact support for assistance. Delivery operations remain unavailable.";
      profileTone = "border-red-200 bg-red-50 text-red-900";
    } else if (riderProfile.verificationStatus !== "approved") {
      profileHeading =
        riderProfile.verificationStatus === "under_review"
          ? "Verification under review"
          : "Verification pending";
      profileMessage =
        "Your rider profile is waiting for verification to be completed. Delivery operations are not available yet.";
      profileTone = "border-amber-200 bg-amber-50 text-amber-900";
    } else if (riderProfile.activationStatus === "inactive") {
      profileHeading = "Rider account not activated";
      profileMessage =
        "Your verification is approved, but your rider account is not active yet. Contact support if you need assistance.";
      profileTone = "border-amber-200 bg-amber-50 text-amber-900";
    } else {
      profileHeading = "Your rider account is active";
      profileMessage =
        "Your verification is approved and your account is active. You can manage your availability below.";
      profileTone = "border-emerald-200 bg-emerald-50 text-emerald-900";
    }
  } else if (profileState === "missing") {
    profileHeading = "Rider profile not found";
    profileMessage =
      "Your login has the rider role, but no rider profile is linked to your account. Please contact support to have your profile checked.";
    profileTone = "border-amber-200 bg-amber-50 text-amber-900";
  } else if (profileState === "error") {
    profileHeading = "Unable to verify your account";
    profileMessage = profileError;
    profileTone = "border-red-200 bg-red-50 text-red-900";
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="min-h-screen lg:flex">
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 transition-transform duration-200 lg:static lg:z-auto lg:block lg:translate-x-0 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <RiderSidebar onNavigate={() => setMobileMenuOpen(false)} />
        </div>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(true)}
                className="flex size-10 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 lg:hidden"
              >
                ☰
              </button>

              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Rider dashboard
                </p>
                <p className="hidden text-xs text-slate-500 sm:block">
                  Your delivery workspace
                </p>
              </div>
            </div>

            <div
              aria-live="polite"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              {accountStatus}
            </div>
          </header>

          <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="text-sm font-semibold text-orange-700">
                    RIDER WORKSPACE
                  </p>

                  <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    Welcome to your dashboard
                  </h1>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                    Manage your delivery work, follow pickup stops, and keep
                    track of completed deliveries from one place.
                  </p>
                </div>

                <div
                  className={`rounded-xl border p-4 lg:min-w-64 ${profileTone}`}
                >
                  <p className="text-sm font-semibold">{profileHeading}</p>
                  <p className="mt-2 text-sm leading-5">{profileMessage}</p>

                  {profileState === "ready" && riderProfile && (
                    <div className="mt-4 space-y-2 border-t border-current/10 pt-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>Verification</span>
                        <span className="font-semibold">
                          {verificationLabel(riderProfile.verificationStatus)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>Activation</span>
                        <span className="font-semibold">
                          {activationLabel(riderProfile.activationStatus)}
                        </span>
                      </div>
                    </div>
                  )}

                  {profileState === "error" && (
                    <button
                      type="button"
                      onClick={() => void loadRiderProfile()}
                      className="mt-4 rounded-lg border border-current/20 px-3 py-2 text-sm font-semibold hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                    >
                      Try again
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section aria-labelledby="summary-heading">
              <div className="mb-4">
                <h2
                  id="summary-heading"
                  className="text-lg font-bold text-slate-900"
                >
                  Your summary
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Delivery and earnings figures will appear when connected to
                  your account.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {summaryCards.map((card) => (
                  <article
                    key={card.title}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-600">
                          {card.title}
                        </p>
                        <p className="mt-3 text-3xl font-bold text-slate-900">
                          {card.value}
                        </p>
                      </div>

                      <span
                        aria-hidden="true"
                        className="flex size-11 items-center justify-center rounded-xl bg-orange-50 text-xl font-semibold text-orange-700"
                      >
                        {card.icon}
                      </span>
                    </div>

                    <p className="mt-4 text-xs text-slate-500">
                      {card.description}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Current delivery
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Your assigned delivery will appear here.
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    Not connected
                  </span>
                </div>

                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-slate-200"
                  >
                    ▤
                  </span>

                  <h3 className="mt-4 font-semibold text-slate-800">
                    No delivery data loaded
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Assigned orders, merchant pickup stops, route details, and
                    customer drop-off instructions will appear once the
                    authorized delivery data connection is implemented.
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">
                  Availability
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Control whether you are available for delivery work.
                </p>

                <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <span
                    aria-hidden="true"
                    className={`size-3 rounded-full ${
                      riderCanOperate && riderProfile?.isOnline
                        ? "bg-emerald-500"
                        : "bg-slate-400"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {profileState === "loading"
                        ? "Checking availability…"
                        : !riderCanOperate
                          ? "Not eligible for operations"
                          : riderProfile?.isOnline
                            ? "You are online"
                            : "You are offline"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {riderCanOperate
                        ? riderProfile?.isOnline
                          ? "You are marked available. GPS sharing runs while you are online."
                          : "Go online when you are ready to become available."
                        : "Your account must be approved and active to change availability."}
                    </p>
                  </div>
                </div>

                {riderCanOperate && riderProfile?.isOnline && (
                  <div
                    className={`mt-4 rounded-xl border p-4 ${
                      gpsState === "sharing"
                        ? "border-emerald-200 bg-emerald-50"
                        : gpsState === "error"
                          ? "border-red-200 bg-red-50"
                          : "border-amber-200 bg-amber-50"
                    }`}
                    aria-live="polite"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`size-2.5 rounded-full ${
                          gpsState === "sharing"
                            ? "bg-emerald-500"
                            : gpsState === "error"
                              ? "bg-red-500"
                              : "bg-amber-500"
                        }`}
                      />
                      <p className="text-sm font-semibold text-slate-900">
                        {gpsState === "sharing"
                          ? "GPS sharing active"
                          : gpsState === "error"
                            ? "GPS sharing needs attention"
                            : "Connecting to GPS"}
                      </p>
                    </div>

                    <p className="mt-2 text-sm leading-5 text-slate-700">
                      {gpsMessage || "Waiting for your device's location."}
                    </p>

                    {lastGpsUpdate && gpsState === "sharing" && (
                      <p className="mt-2 text-xs text-slate-600">
                        Last location update: {lastGpsUpdate}
                      </p>
                    )}
                  </div>
                )}

                {riderCanOperate && riderProfile && (
                  <button
                    type="button"
                    disabled={onlineUpdating}
                    onClick={() =>
                      void updateOnlineStatus(!riderProfile.isOnline)
                    }
                    className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                      riderProfile.isOnline
                        ? "bg-slate-700 hover:bg-slate-800 focus-visible:ring-slate-500"
                        : "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500"
                    }`}
                  >
                    {onlineUpdating
                      ? "Updating availability…"
                      : riderProfile.isOnline
                        ? "Go offline"
                        : "Go online"}
                  </button>
                )}

                {onlineError && (
                  <p
                    role="alert"
                    className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  >
                    {onlineError}
                  </p>
                )}

                {onlineMessage && (
                  <p
                    role="status"
                    className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
                  >
                    {onlineMessage}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void loadRiderProfile()}
                  disabled={profileState === "loading" || onlineUpdating}
                  className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Refresh status
                </button>

                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Online status does not share GPS coordinates yet. Location
                  sharing will be added separately with its own permission and
                  security checks.
                </p>
              </article>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">
                Recent activity
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your recent delivery updates will appear here.
              </p>

              <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200"
                >
                  i
                </span>
                <p className="text-sm leading-6 text-slate-600">
                  Activity is not connected yet. No delivery history is being
                  fabricated or displayed as real data.
                </p>
              </div>
            </section>

            <footer className="pb-2 text-center text-xs text-slate-500">
              LogisticApp Rider Workspace
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
