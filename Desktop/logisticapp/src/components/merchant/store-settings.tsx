"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const StoreLocationMap = dynamic(
  () => import("@/components/merchant/store-location-map"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center rounded-xl border bg-slate-50 text-sm text-slate-500">
        Loading map…
      </div>
    ),
  },
);

type MerchantMembership = {
  merchant_id: string;
  membership_status: string;
  merchant_status: string;
  business_name: string;
};

type DeliveryArea = {
  id: string;
  name: string;
  slug: string;
};

type StoreSettingsData = {
  merchant: {
    id: string;
    business_name: string;
    business_phone: string | null;
    business_email: string | null;
    status: string;
  };
  location: {
    id: string;
    location_name: string;
    address_text: string;
    city: string | null;
    state_region: string | null;
    country_code: string;
    latitude: number | string | null;
    longitude: number | string | null;
    is_active: boolean;
  };
  delivery_area: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
  } | null;
  hours: {
    day_of_week: number;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
  }[];
  membership_role: string;
};

type DaySchedule = {
  day_of_week: number;
  is_closed: boolean;
  opens_at: string;
  closes_at: string;
};

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DB_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const EMPTY_SCHEDULE: DaySchedule[] = DB_DAY_ORDER.map((day) => ({
  day_of_week: day,
  is_closed: true,
  opens_at: "09:00",
  closes_at: "17:00",
}));

function asCoordinate(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTime(value: string | null | undefined): string {
  if (!value) return "09:00";
  return value.slice(0, 5);
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export default function StoreSettings({
  memberships,
}: {
  memberships: MerchantMembership[];
}) {
  const supabase = useMemo(() => createClient(), []);

  const [selectedMerchantId, setSelectedMerchantId] = useState(
    memberships[0]?.merchant_id ?? "",
  );
  const [data, setData] = useState<StoreSettingsData | null>(null);
  const [schedule, setSchedule] = useState<DaySchedule[]>(EMPTY_SCHEDULE);
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [savingArea, setSavingArea] = useState(false);
  const [activating, setActivating] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const loadAreas = useCallback(async () => {
    setLoadingAreas(true);

    const { data: result, error: rpcError } = await supabase.rpc(
      "get_active_delivery_areas",
    );

    if (rpcError) {
      setAreas([]);
      setError(getErrorMessage(rpcError));
      setLoadingAreas(false);
      return;
    }

    setAreas((result ?? []) as DeliveryArea[]);
    setLoadingAreas(false);
  }, [supabase]);

  const loadSettings = useCallback(async () => {
    if (!selectedMerchantId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    const { data: result, error: rpcError } = await supabase.rpc(
      "get_merchant_store_settings",
      { p_merchant_id: selectedMerchantId },
    );

    if (rpcError) {
      setError(getErrorMessage(rpcError));
      setData(null);
      setLoading(false);
      return;
    }

    const settings = result as StoreSettingsData;

    if (!settings?.merchant || !settings?.location) {
      setError("The store settings response was incomplete.");
      setData(null);
      setLoading(false);
      return;
    }

    setData(settings);
    setSelectedAreaId(settings.delivery_area?.id ?? "");
    setBusinessName(settings.merchant.business_name ?? "");
    setLocationName(settings.location.location_name ?? "");
    setAddress(settings.location.address_text ?? "");
    setCity(settings.location.city ?? "");
    setStateRegion(settings.location.state_region ?? "");
    setLatitude(asCoordinate(settings.location.latitude));
    setLongitude(asCoordinate(settings.location.longitude));

    const savedByDay = new Map(
      (settings.hours ?? []).map((hour) => [hour.day_of_week, hour]),
    );

    setSchedule(
      DB_DAY_ORDER.map((day) => {
        const saved = savedByDay.get(day);
        return {
          day_of_week: day,
          is_closed: saved?.is_closed ?? true,
          opens_at: toTime(saved?.opens_at),
          closes_at: toTime(saved?.closes_at),
        };
      }),
    );

    setLoading(false);
  }, [selectedMerchantId, supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadAreas);
  }, [loadAreas]);

  useEffect(() => {
    void Promise.resolve().then(loadSettings);
  }, [loadSettings]);

  const isPendingSetup = data?.merchant.status === "pending_setup";
  const canActivate = isPendingSetup && data?.membership_role === "owner";
  const selectedArea = areas.find((area) => area.id === selectedAreaId);
  const hasSavedArea = Boolean(data?.delivery_area?.id);

  function updateDay(dayOfWeek: number, updates: Partial<DaySchedule>) {
    setSchedule((current) =>
      current.map((day) =>
        day.day_of_week === dayOfWeek ? { ...day, ...updates } : day,
      ),
    );
  }

  async function saveDeliveryArea() {
    setError("");
    setNotice("");

    if (!data || !canActivate) {
      setError(
        "Only the active store owner can set the delivery area before activation.",
      );
      return;
    }

    if (!selectedAreaId) {
      setError("Select a delivery area before continuing.");
      return;
    }

    if (!selectedArea) {
      setError(
        "That delivery area is no longer available. Refresh the list and choose an active area.",
      );
      return;
    }

    if (hasSavedArea && data.delivery_area?.id === selectedAreaId) {
      setNotice("This delivery area is already saved.");
      return;
    }

    setSavingArea(true);

    const { error: rpcError } = await supabase.rpc(
      "save_merchant_delivery_area",
      {
        p_merchant_id: selectedMerchantId,
        p_delivery_area_id: selectedAreaId,
      },
    );

    setSavingArea(false);

    if (rpcError) {
      setError(getErrorMessage(rpcError));
      return;
    }

    setNotice(`Delivery area "${selectedArea.name}" saved successfully.`);
    await loadSettings();
  }

  async function activateStore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!canActivate) {
      setError("Only an active store owner can activate this store.");
      return;
    }

    if (!data?.delivery_area?.id) {
      setError("Save one active delivery area before activating your store.");
      return;
    }

    if (latitude === null || longitude === null) {
      setError("Select the actual store location on the map first.");
      return;
    }

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError("Enter valid latitude and longitude coordinates.");
      return;
    }

    setActivating(true);

    const { error: rpcError } = await supabase.rpc("activate_merchant_store", {
      p_merchant_id: selectedMerchantId,
      p_business_name: businessName.trim(),
      p_location_name: locationName.trim(),
      p_address_text: address.trim(),
      p_city: city.trim(),
      p_state_region: stateRegion.trim(),
      p_latitude: latitude,
      p_longitude: longitude,
    });

    setActivating(false);

    if (rpcError) {
      setError(getErrorMessage(rpcError));
      return;
    }

    setNotice("Store activated successfully.");
    await loadSettings();
  }

  async function saveOpeningHours(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    for (const day of schedule) {
      if (day.is_closed) continue;

      if (!day.opens_at || !day.closes_at) {
        setError("Choose opening and closing times for every open day.");
        return;
      }

      if (day.opens_at >= day.closes_at) {
        setError(
          `Closing time must be later than opening time for ${
            DAY_NAMES[DB_DAY_ORDER.indexOf(day.day_of_week)]
          }. Overnight opening hours are not supported yet.`,
        );
        return;
      }
    }

    setSavingHours(true);

    const payload = schedule.map((day) => ({
      day_of_week: day.day_of_week,
      is_closed: day.is_closed,
      opens_at: day.is_closed ? null : day.opens_at,
      closes_at: day.is_closed ? null : day.closes_at,
    }));

    const { error: rpcError } = await supabase.rpc(
      "save_merchant_location_hours",
      {
        p_location_id: data?.location.id,
        p_schedule: payload,
      },
    );

    setSavingHours(false);

    if (rpcError) {
      setError(getErrorMessage(rpcError));
      return;
    }

    setNotice("Opening hours saved successfully.");
    await loadSettings();
  }

  if (memberships.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        No active merchant membership was found for this account. Contact your
        administrator if you believe this is incorrect.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-medium text-violet-700">MERCHANT PORTAL</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Store Settings
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Manage your business details, delivery area, map location, and opening
          hours.
        </p>
      </div>

      {memberships.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label
            htmlFor="merchant-select"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Select store
          </label>
          <select
            id="merchant-select"
            value={selectedMerchantId}
            onChange={(event) => setSelectedMerchantId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          >
            {memberships.map((membership) => (
              <option
                key={membership.merchant_id}
                value={membership.merchant_id}
              >
                {membership.business_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading store settings…
        </div>
      ) : data ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Business Information
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Provide the business identity and physical store location.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {data.merchant.status.replaceAll("_", " ")}
              </span>
            </div>

            {isPendingSetup && (
              <div className="mt-4 rounded-lg bg-violet-50 p-3 text-sm text-violet-900">
                Complete these details and activate your store. Activation
                requires an active delivery area, a valid map location, and an
                active owner membership. Opening hours can be saved separately.
              </div>
            )}

            {!isPendingSetup && (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Business details and delivery area are read-only after
                activation. Contact your administrator if business identity or
                address changes require an update.
              </p>
            )}

            <form onSubmit={activateStore} className="mt-5 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="business-name"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Business name
                  </label>
                  <input
                    id="business-name"
                    required
                    minLength={2}
                    maxLength={160}
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    disabled={!isPendingSetup || !canActivate}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="location-name"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Location name
                  </label>
                  <input
                    id="location-name"
                    required
                    minLength={2}
                    maxLength={160}
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    disabled={!isPendingSetup || !canActivate}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="street-address"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Street address
                  </label>
                  <input
                    id="street-address"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={!isPendingSetup || !canActivate}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="city"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    City
                  </label>
                  <input
                    id="city"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={!isPendingSetup || !canActivate}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="state-region"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    State
                  </label>
                  <input
                    id="state-region"
                    required
                    value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                    disabled={!isPendingSetup || !canActivate}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="country"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Country
                  </label>
                  <input
                    id="country"
                    value="Nigeria (NG)"
                    disabled
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Delivery Area <span className="text-red-600">*</span>
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Select the one delivery area this store serves. The area is
                  fixed after activation.
                </p>

                {loadingAreas ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Loading available areas…
                  </p>
                ) : areas.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    No active delivery areas are available. Ask an administrator
                    to add and activate an area in the Admin Dashboard.
                  </p>
                ) : (
                  <>
                    <label
                      htmlFor="delivery-area"
                      className="mb-1.5 mt-4 block text-sm font-medium text-slate-700"
                    >
                      Choose delivery area
                    </label>
                    <select
                      id="delivery-area"
                      required
                      value={selectedAreaId}
                      onChange={(event) =>
                        setSelectedAreaId(event.target.value)
                      }
                      disabled={!canActivate || savingArea}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value="">Select an area</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>

                    {selectedAreaId !== data.delivery_area?.id &&
                      canActivate && (
                        <button
                          type="button"
                          onClick={() => void saveDeliveryArea()}
                          disabled={
                            savingArea ||
                            !selectedAreaId ||
                            loadingAreas ||
                            !selectedArea
                          }
                          className="mt-3 rounded-lg border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingArea ? "Saving area…" : "Save Delivery Area"}
                        </button>
                      )}
                  </>
                )}

                {data.delivery_area && (
                  <p className="mt-3 text-sm text-slate-700">
                    <span className="font-medium">Saved area:</span>{" "}
                    {data.delivery_area.name}
                    {!data.delivery_area.is_active && (
                      <span className="ml-2 text-amber-700">
                        (currently inactive)
                      </span>
                    )}
                  </p>
                )}

                {!data.delivery_area && (
                  <p className="mt-3 text-xs text-slate-500">
                    Your selection must be saved before you activate the store.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Store location
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Place the pin at the actual delivery pickup point.
                  </p>
                </div>

                <StoreLocationMap
                  latitude={latitude}
                  longitude={longitude}
                  onChange={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                  disabled={!isPendingSetup || !canActivate}
                />

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="latitude"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Latitude
                    </label>
                    <input
                      id="latitude"
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      value={latitude ?? ""}
                      onChange={(e) =>
                        setLatitude(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      disabled={!isPendingSetup || !canActivate}
                      placeholder="Select on the map"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="longitude"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Longitude
                    </label>
                    <input
                      id="longitude"
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      value={longitude ?? ""}
                      onChange={(e) =>
                        setLongitude(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      disabled={!isPendingSetup || !canActivate}
                      placeholder="Select on the map"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {isPendingSetup && (
                <button
                  type="submit"
                  disabled={
                    activating ||
                    !canActivate ||
                    loadingAreas ||
                    !hasSavedArea ||
                    !data.delivery_area?.is_active
                  }
                  className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {activating ? "Activating store…" : "Activate Store"}
                </button>
              )}

              {isPendingSetup && !canActivate && (
                <p className="text-sm text-amber-800">
                  Only the active owner can activate this store. You can still
                  manage opening hours if your membership role permits it.
                </p>
              )}
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Opening Hours
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Set a schedule for each day. Closed days are saved explicitly.
              Times use the store’s local time in Nigeria (Africa/Lagos).
            </p>

            <form onSubmit={saveOpeningHours} className="mt-5 space-y-3">
              {schedule.map((day) => (
                <div
                  key={day.day_of_week}
                  className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_auto_1fr_1fr] sm:items-center"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {DAY_NAMES[DB_DAY_ORDER.indexOf(day.day_of_week)]}
                  </span>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={day.is_closed}
                      onChange={(e) =>
                        updateDay(day.day_of_week, {
                          is_closed: e.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-violet-600"
                    />
                    Closed
                  </label>

                  <div>
                    <label
                      htmlFor={`opens-${day.day_of_week}`}
                      className="mb-1 block text-xs text-slate-500"
                    >
                      Opens
                    </label>
                    <input
                      id={`opens-${day.day_of_week}`}
                      type="time"
                      required={!day.is_closed}
                      disabled={day.is_closed || savingHours}
                      value={day.opens_at}
                      onChange={(e) =>
                        updateDay(day.day_of_week, {
                          opens_at: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`closes-${day.day_of_week}`}
                      className="mb-1 block text-xs text-slate-500"
                    >
                      Closes
                    </label>
                    <input
                      id={`closes-${day.day_of_week}`}
                      type="time"
                      required={!day.is_closed}
                      disabled={day.is_closed || savingHours}
                      value={day.closes_at}
                      onChange={(e) =>
                        updateDay(day.day_of_week, {
                          closes_at: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-50"
                    />
                  </div>
                </div>
              ))}

              <button
                type="submit"
                disabled={savingHours || loading}
                className="w-full rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50 sm:w-auto"
              >
                {savingHours ? "Saving hours…" : "Save Opening Hours"}
              </button>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
