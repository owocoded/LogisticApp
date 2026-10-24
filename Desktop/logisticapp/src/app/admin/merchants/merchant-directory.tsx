"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type MerchantLocation = {
  id: string;
  location_name: string;
  address_text: string;
  city: string | null;
  state_region: string | null;
  is_active: boolean;
};

type Merchant = {
  id: string;
  business_name: string;
  business_phone: string | null;
  business_email: string | null;
  status: string;
  created_at: string;
  merchant_locations: MerchantLocation[];
};

type DirectoryResponse = {
  merchants: Merchant[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

export default function MerchantDirectory() {
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMerchants = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !publishableKey) {
        throw new Error("Supabase configuration is missing.");
      }

      const endpoint = new URL(
        `${supabaseUrl}/functions/v1/admin-listing-merchants`,
      );

      endpoint.searchParams.set("page", String(page));
      endpoint.searchParams.set("page_size", "20");

      const response = await fetch(endpoint.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: publishableKey,
        },
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : `Unable to load merchants (${response.status}).`,
        );
      }

      if (!result || !Array.isArray(result.merchants) || !result.pagination) {
        throw new Error("The server returned an unexpected response.");
      }

      setData(result as DirectoryResponse);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "An unexpected error occurred.",
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

useEffect(() => {
  let cancelled = false;

  const timer = setTimeout(() => {
    if (!cancelled) {
      void loadMerchants();
    }
  }, 0);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [loadMerchants]);

  function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
    }).format(date);
  }

  function formatLocation(location: MerchantLocation) {
    return [location.location_name, location.city, location.state_region]
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {data
            ? `${data.pagination.total} merchant${
                data.pagination.total === 1 ? "" : "s"
              }`
            : "Merchant directory"}
        </p>

        <button
          type="button"
          onClick={() => void loadMerchants()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void loadMerchants()}
            disabled={loading}
            className="mt-2 font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !data && (
        <p className="py-6 text-sm text-slate-500">Loading merchants...</p>
      )}

      {!loading && !error && data?.merchants.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="font-medium text-slate-800">No merchants yet</p>
        </div>
      )}

      {data && data.merchants.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Business</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {data.merchants.map((merchant) => (
                  <tr key={merchant.id}>
                    <td className="px-4 py-4 align-top">
                      <Link
                        href={`/admin/merchants/${merchant.id}`}
                        className="font-semibold text-violet-700 hover:text-violet-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                      >
                        {merchant.business_name}
                      </Link>

                      {merchant.business_phone && (
                        <p className="mt-1 text-slate-600">
                          {merchant.business_phone}
                        </p>
                      )}

                      {merchant.business_email && (
                        <p className="mt-1 break-all text-slate-500">
                          {merchant.business_email}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 align-top">
                      {merchant.merchant_locations.length > 0 ? (
                        <div className="space-y-3">
                          {merchant.merchant_locations.map((location) => (
                            <div key={location.id}>
                              <p className="font-medium text-slate-800">
                                {formatLocation(location)}
                              </p>
                              <p className="mt-1 max-w-xs text-slate-500">
                                {location.address_text}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {location.is_active
                                  ? "Location active"
                                  : "Location inactive"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">No locations</span>
                      )}
                    </td>

                    <td className="px-4 py-4 align-top">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {merchant.status.replaceAll("_", " ")}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 align-top text-slate-600">
                      {formatDate(merchant.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Page {data.pagination.page} of{" "}
              {Math.max(data.pagination.total_pages, 1)}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={loading || page >= data.pagination.total_pages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
