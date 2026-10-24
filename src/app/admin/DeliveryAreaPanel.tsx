"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type DeliveryArea = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

function makeSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function DeliveryAreasPanel() {
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [areaName, setAreaName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadAreas = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "admin_list_delivery_areas",
      );

      if (rpcError) throw rpcError;

      setAreas((data ?? []) as DeliveryArea[]);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load delivery areas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAreas();
    });
  }, [loadAreas]);

  async function handleAddArea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = areaName.trim();
    const slug = makeSlug(name);

    setError("");
    setSuccess("");

    if (!name) {
      setError("Enter a delivery area name.");
      return;
    }

    if (name.length > 100) {
      setError("The area name must be 100 characters or fewer.");
      return;
    }

    if (!slug) {
      setError("Enter a name that can be used to create an area slug.");
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      const { error: rpcError } = await supabase.rpc("create_delivery_area", {
        p_name: name,
        p_slug: slug,
      });

      if (rpcError) throw rpcError;

      setLoading(true);
      await loadAreas();
      setAreaName("");
      setModalOpen(false);
      setSuccess(`${name} was added successfully.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the delivery area.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Delivery Areas
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage the areas where merchants can offer deliveries.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError("");
            setSuccess("");
            setAreaName("");
            setModalOpen(true);
          }}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
        >
          + Add Area
        </button>
      </div>

      {success && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}

      {error && !modalOpen && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading delivery areas...</p>
        ) : areas.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No delivery areas have been created yet. Select Add Area to create
            your first one.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {areas.map((area) => (
              <li
                key={area.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{area.name}</p>
                  <p className="text-xs text-slate-500">{area.slug}</p>
                </div>

                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
                    area.is_active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {area.is_active ? "Active" : "Inactive"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setModalOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-delivery-area-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="add-delivery-area-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Add delivery area
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Enter the name customers and merchants will use.
                </p>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddArea} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="delivery-area-name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Area name
                </label>
                <input
                  id="delivery-area-name"
                  type="text"
                  required
                  maxLength={100}
                  autoFocus
                  value={areaName}
                  onChange={(event) => setAreaName(event.target.value)}
                  placeholder="e.g. Magbon"
                  className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
                />
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">
                  Generated area slug
                </p>
                <p className="mt-1 break-all text-sm text-slate-800">
                  {makeSlug(areaName) || "area-name"}
                </p>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-10 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Adding area..." : "Add Area"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
