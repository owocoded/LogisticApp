"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type VehicleType = "bicycle" | "motorcycle" | "car" | "van" | "other";
type RiderProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  house_address: string | null;
  vehicle_type: VehicleType | null;
  vehicle_registration: string | null;
  verification_status: string;
  activation_status: string;
  is_online: boolean;
  created_at?: string;
  updated_at?: string;
};

const vehicleOptions: { value: VehicleType; label: string }[] = [
  { value: "motorcycle", label: "Motorcycle" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
  { value: "van", label: "Van" },
  { value: "other", label: "Other" },
];

function displayStatus(value?: string | null) {
  if (!value) return "Not submitted";

  return value.replaceAll("_", " ");
}

export default function RiderProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<RiderProfile | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [houseAddress, setHouseAddress] = useState("");
  const [vehicleType, setVehicleType] =
    useState<VehicleType>("motorcycle");
  const [vehicleRegistration, setVehicleRegistration] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const supabase = createClient();

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          router.replace("/portal/login");
          return;
        }

        if (cancelled) return;

        // Email comes from the authenticated Supabase user, not form input.
        setEmail(user.email ?? "");

        const { data, error: profileError } = await supabase.rpc(
          "get_my_rider_profile",
        );

        if (profileError) throw profileError;

        if (cancelled) return;

        if (data) {
          const saved = data as RiderProfile;

          setProfile(saved);
          setFullName(saved.full_name ?? "");
          setPhone(saved.phone ?? "");
          setHouseAddress(saved.house_address ?? "");
          setVehicleType(saved.vehicle_type ?? "motorcycle");
          setVehicleRegistration(saved.vehicle_registration ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Unable to load rider profile:", err);
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load your rider profile. Please try again.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (profile) {
      setError("Your profile has already been submitted.");
      return;
    }

    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanAddress = houseAddress.trim();
    const cleanRegistration = vehicleRegistration.trim().toUpperCase();

    if (
      !cleanName ||
      !cleanPhone ||
      !cleanAddress ||
      (vehicleType !== "bicycle" && !cleanRegistration)
    ) {
      setError(
        vehicleType === "bicycle"
          ? "Please complete your personal details."
          : "Please complete all required fields, including vehicle registration.",
      );
      return;
    }

    if (cleanName.length > 120) {
      setError("Your full name must be 120 characters or fewer.");
      return;
    }

    if (cleanPhone.length > 30) {
      setError("Your phone number must be 30 characters or fewer.");
      return;
    }

    if (cleanAddress.length > 500) {
      setError("Your house address must be 500 characters or fewer.");
      return;
    }

    if (cleanRegistration && cleanRegistration.length > 50) {
      setError("Your vehicle registration must be 50 characters or fewer.");
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      const { error: submitError } = await supabase.rpc(
        "submit_rider_profile",
        {
          p_full_name: cleanName,
          p_phone: cleanPhone,
          p_house_address: cleanAddress,
          p_vehicle_type: vehicleType,
          p_vehicle_registration: vehicleType === "bicycle" ? "" : cleanRegistration,
        },
      );

      if (submitError) throw submitError;

      // Load the persisted record from the secure read function.
      const { data, error: reloadError } = await supabase.rpc(
        "get_my_rider_profile",
      );

      if (reloadError) {
        // Submission succeeded, even if refreshing the display failed.
        setSuccess(
          "Your profile was submitted successfully and is awaiting verification. Refresh the page to view its status.",
        );
        return;
      }

      if (!data) {
        setSuccess(
          "Your profile was submitted successfully and is awaiting verification. Refresh the page to view its status.",
        );
        return;
      }

      const saved = data as RiderProfile;

      setProfile(saved);
      setFullName(saved.full_name ?? cleanName);
      setPhone(saved.phone ?? cleanPhone);
      setHouseAddress(saved.house_address ?? cleanAddress);
      setVehicleType(saved.vehicle_type ?? vehicleType);
      setVehicleRegistration(
        saved.vehicle_registration ?? cleanRegistration,
      );

      setSuccess(
        "Your rider profile has been submitted successfully. It is now awaiting verification.",
      );
    } catch (err) {
      const details =
        err && typeof err === "object"
          ? JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
          : String(err);

      console.error("Rider profile submission failed:", details);

      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err
            ? String(err.message)
            : String(err);

      if (
        message.toLowerCase().includes("already exists") ||
        message.includes("23505")
      ) {
        setError(
          "A rider profile already exists for this account. Refresh the page to load it.",
        );
      } else if (
        message.toLowerCase().includes("rider permission required")
      ) {
        setError(
          "This account does not have rider access. Please contact the administrator.",
        );
      } else if (
        message.toLowerCase().includes("authentication required")
      ) {
        setError("Your session has expired. Please sign in again.");
        router.replace("/portal/login");
      } else {
        setError(message || "Profile submission failed. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = profile
    ? displayStatus(profile.verification_status)
    : "Not submitted";

  const isSubmitted = Boolean(profile);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/rider/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-violet-700"
        >
          <span aria-hidden="true">←</span>
          Back to dashboard
        </Link>

        <header className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">
            Rider portal
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            My profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Complete your personal and vehicle information. Your account must be
            approved and activated before you can go online.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {success}
          </div>
        )}

        {loading ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading your profile...
          </div>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Verification status
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isSubmitted
                      ? `Your account is ${statusLabel}.`
                      : "You have not submitted your rider profile yet."}
                  </p>
                </div>

                <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold capitalize text-amber-800 ring-1 ring-inset ring-amber-200">
                  {statusLabel}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Account email
                  </dt>
                  <dd className="mt-1 break-all text-sm font-medium text-slate-900">
                    {email || "Not available"}
                  </dd>
                  <p className="mt-1 text-xs text-slate-500">
                    Retrieved from your signed-in account.
                  </p>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Activation
                  </dt>
                  <dd className="mt-1 text-sm font-medium capitalize text-slate-900">
                    {displayStatus(profile?.activation_status) ===
                    "Not submitted"
                      ? "Not activated"
                      : displayStatus(profile?.activation_status)}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Availability
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {profile?.is_online ? "Online" : "Offline"}
                  </dd>
                </div>
              </dl>

              {!profile && (
                <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  Complete the form below to submit your details for admin
                  verification. Your profile will start as pending, inactive,
                  and offline.
                </p>
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-semibold text-slate-900">
                Personal information
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Provide your contact details and residential address.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                <div>
                  <label
                    htmlFor="fullName"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Full name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    disabled={saving || isSubmitted}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Phone number <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Enter your phone number"
                    autoComplete="tel"
                    required
                    maxLength={30}
                    disabled={saving || isSubmitted}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="houseAddress"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    House address <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    id="houseAddress"
                    name="houseAddress"
                    value={houseAddress}
                    onChange={(event) => setHouseAddress(event.target.value)}
                    placeholder="Enter your full residential address"
                    autoComplete="street-address"
                    required
                    maxLength={500}
                    rows={3}
                    disabled={saving || isSubmitted}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                  />
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-base font-semibold text-slate-900">
                    Vehicle information
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Enter the details of the vehicle you intend to use for
                    deliveries.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="vehicleType"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Vehicle type <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="vehicleType"
                    name="vehicleType"
                    value={vehicleType}
                    onChange={(event) =>
                      setVehicleType(event.target.value as VehicleType)
                    }
                    required
                    disabled={saving || isSubmitted}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                  >
                    {vehicleOptions.map((vehicle) => (
                      <option key={vehicle.value} value={vehicle.value}>
                        {vehicle.label}
                      </option>
                    ))}
                  </select>
                </div>

                {vehicleType !== "bicycle" && (
                  <div>
                    <label
                      htmlFor="vehicleRegistration"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Vehicle registration number{" "}
                      <span className="text-red-600">*</span>
                    </label>

                    <input
                      id="vehicleRegistration"
                      name="vehicleRegistration"
                      type="text"
                      value={vehicleRegistration}
                      onChange={(event) =>
                        setVehicleRegistration(event.target.value.toUpperCase())
                      }
                      placeholder="Enter registration number"
                      required
                      maxLength={50}
                      disabled={saving || isSubmitted}
                      autoComplete="off"
                      className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm uppercase text-slate-900 outline-none transition placeholder:normal-case placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                    />

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Enter the registration as shown on your vehicle documents.
                    </p>
                  </div>
                )}

                {isSubmitted ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                    Your profile has been submitted. The details are read-only
                    until a secure profile update process is implemented.
                  </p>
                ) : (
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {saving ? "Submitting..." : "Submit rider profile"}
                  </button>
                )}
              </form>
            </section>

            <section className="mt-6 rounded-2xl border border-violet-100 bg-violet-50 p-5">
              <h2 className="font-semibold text-violet-950">
                What happens next?
              </h2>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-violet-900">
                <li>Submit your personal and vehicle details.</li>
                <li>Wait for the admin team to review your information.</li>
                <li>After approval and activation, you can go online.</li>
              </ol>
            </section>
          </>
        )}
      </div>
    </main>
  );
}