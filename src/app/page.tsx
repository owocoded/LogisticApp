"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type DeliveryArea = {
  id: string;
  name: string;
  slug: string;
};

const STORAGE_KEY = "logisticapp_delivery_area";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [continuing, setContinuing] = useState(false);

  const requestedSlug = searchParams.get("area")?.trim() ?? "";

  const loadAreas = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const { data, error: rpcError } = await supabase.rpc(
        "get_active_delivery_areas",
      );

      if (rpcError) throw rpcError;

      const activeAreas = (data ?? []) as DeliveryArea[];
      setAreas(activeAreas);

      // An area supplied in the URL takes priority.
      if (requestedSlug) {
        const urlArea = activeAreas.find((area) => area.slug === requestedSlug);

        setSelectedAreaId(urlArea?.id ?? "");

        if (urlArea) {
          window.localStorage.setItem(STORAGE_KEY, urlArea.id);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }

        return;
      }

      // Restore the saved area only if it is still active.
      const savedId = window.localStorage.getItem(STORAGE_KEY);

      if (savedId) {
        const savedArea = activeAreas.find((area) => area.id === savedId);

        if (savedArea) {
          setSelectedAreaId(savedArea.id);

          const params = new URLSearchParams(searchParams.toString());
          params.set("area", savedArea.slug);

          router.replace(`/?${params.toString()}`, { scroll: false });
          return;
        }

        window.localStorage.removeItem(STORAGE_KEY);
      }

      setSelectedAreaId("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't load delivery areas. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [requestedSlug, router, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAreas();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAreas]);

  function handleAreaChange(areaId: string) {
    setSelectedAreaId(areaId);
    setError("");

    const params = new URLSearchParams(searchParams.toString());

    if (!areaId) {
      window.localStorage.removeItem(STORAGE_KEY);
      params.delete("area");

      const query = params.toString();
      router.replace(query ? `/?${query}` : "/", { scroll: false });
      return;
    }

    const area = areas.find((item) => item.id === areaId);

    if (!area) return;

    window.localStorage.setItem(STORAGE_KEY, area.id);
    params.set("area", area.slug);

    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  function handleContinue() {
    const area = areas.find((item) => item.id === selectedAreaId);

    if (!area) {
      setError("Please select an active delivery area to continue.");
      return;
    }

    setError("");
    setContinuing(true);

    // The store catalogue route will be implemented in the next step.
    router.push(`/stores?area=${encodeURIComponent(area.slug)}`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="text-2xl font-extrabold tracking-tight text-violet-700"
            aria-label="Home"
          >
            Logistic<span className="text-slate-900">App</span>
          </Link>

          <Link
            href="/portal/login"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Merchant login
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-100 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-orange-100 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700">
              <span className="h-2 w-2 rounded-full bg-violet-600" />
              Your neighbourhood, delivered
            </span>

            <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Good things are
              <span className="block text-violet-700">
                closer than you think.
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Discover stores and products available for delivery in your area.
              Choose your location to get started.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="rounded-full border border-slate-200 bg-white px-4 py-2">
                Local stores
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-4 py-2">
                Convenient delivery
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-4 py-2">
                Easy ordering
              </span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-lg">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-2xl"
                aria-hidden="true"
              >
                ⌖
              </div>

              <h2 className="mt-5 text-2xl font-bold tracking-tight">
                Where should we deliver?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Select your delivery area to see stores serving your
                neighbourhood.
              </p>

              <div className="mt-6">
                <label
                  htmlFor="delivery-area"
                  className="mb-2 block text-sm font-semibold text-slate-800"
                >
                  Delivery area
                </label>

                <select
                  id="delivery-area"
                  value={selectedAreaId}
                  onChange={(event) => handleAreaChange(event.target.value)}
                  disabled={loading || areas.length === 0}
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-violet-600 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">
                    {loading
                      ? "Loading delivery areas..."
                      : areas.length === 0
                        ? "No active areas available"
                        : "Choose your area"}
                  </option>

                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() => void loadAreas()}
                    className="mt-2 font-semibold underline underline-offset-2"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!loading && areas.length === 0 && !error && (
                <p className="mt-3 text-sm text-slate-500">
                  There are no active delivery areas yet. Please check back
                  later.
                </p>
              )}

              <button
                type="button"
                onClick={handleContinue}
                disabled={loading || !selectedAreaId || continuing}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {continuing ? "Opening stores..." : "Explore stores"}
                {!continuing && <span aria-hidden="true">→</span>}
              </button>

              <p className="mt-4 text-center text-xs leading-5 text-slate-500">
                Available stores and products depend on your selected area.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} LogisticApp</p>
          <p>Connecting neighbourhoods with local stores.</p>
        </div>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
          <p className="text-sm font-medium text-slate-600">
            Loading delivery areas...
          </p>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
