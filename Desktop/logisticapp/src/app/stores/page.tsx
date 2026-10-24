"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

import { loadCart, saveCart, getCartCount, type CartItem } from "@/lib/cart";

type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  category_id: string | null;
  category_name: string | null;
  preparation_time_minutes: number | null;
  image_path: string | null;
};

type CatalogStore = {
  location_id: string;
  business_name: string;
  location_name: string;
  address_text: string;
  city: string | null;
  state_region: string | null;
  products: CatalogProduct[];
};

type CatalogArea = {
  id: string;
  name: string;
  slug: string;
};

type CatalogResponse = {
  area: CatalogArea | null;
  stores: CatalogStore[];
};

function formatPrice(amountMinor: number, currency: string) {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "NGN";
  const amount = Number(amountMinor);

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format((Number.isFinite(amount) ? amount : 0) / 100);
  } catch {
    return `₦${((Number.isFinite(amount) ? amount : 0) / 100).toLocaleString(
      "en-NG",
    )}`;
  }
}

// Products combine only when the store, name, price, and image match.
function getCartProductKey(item: CartItem): string {
  return JSON.stringify([
    item.storeId,
    item.product.name.trim().toLowerCase(),
    Number(item.product.price_minor),
    item.product.image_path || null,
  ]);
}

function StoreCatalogContent() {
  const searchParams = useSearchParams();
  const areaSlug = searchParams.get("area")?.trim() ?? "";

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [cartAreaSlug, setCartAreaSlug] = useState("");
  const [cartMessage, setCartMessage] = useState("");

  const [productImageUrls, setProductImageUrls] = useState<
    Record<string, string>
  >({});

  const cartCount = getCartCount(cart);

  // Load the saved cart once when the page mounts.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const savedCart = loadCart();

      setCart(savedCart.items);
      setCartAreaSlug(savedCart.areaSlug || areaSlug);
      setCartReady(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []); // Intentionally initialize the cart only once.

  // Persist changes without overwriting the cart before it has loaded.
  useEffect(() => {
    if (!cartReady) return;

    saveCart({
      areaSlug: cartAreaSlug || areaSlug,
      items: cart,
    });
  }, [cart, cartReady, cartAreaSlug, areaSlug]);

  function addToCart(product: CatalogProduct, store: CatalogStore) {
    if (!cartReady) return;

    const cartProduct = {
      ...product,
      price_minor: Number(product.price_minor),
    };

    if (!Number.isFinite(cartProduct.price_minor)) {
      setCartMessage("This product has an invalid price.");
      return;
    }

    const newItem: CartItem = {
      product: cartProduct,
      storeId: store.location_id,
      storeName: store.business_name,
      quantity: 1,
    };

    const newKey = getCartProductKey(newItem);

    setCart((current) => {
      const existing = current.find(
        (item) => getCartProductKey(item) === newKey,
      );

      if (existing) {
        return current.map((item) =>
          getCartProductKey(item) === newKey
            ? { ...item, quantity: Number(item.quantity) + 1 }
            : item,
        );
      }

      return [...current, newItem];
    });

    setCartMessage(`${product.name} added to cart`);
  }

  // Load the catalog and signed product-image URLs.
  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setLoading(true);
      setErrorMessage("");
      setCatalog(null);
      setProductImageUrls({});

      if (!areaSlug) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();

        const { data, error } = await supabase.rpc("get_customer_catalog", {
          p_area_slug: areaSlug,
        });

        if (error) {
          throw new Error(error.message);
        }

        if (!data || typeof data !== "object") {
          throw new Error("The store catalog returned an unexpected response.");
        }

        const result = data as unknown as CatalogResponse;
        const stores = Array.isArray(result.stores) ? result.stores : [];

        const imagePaths = stores
          .flatMap((store) =>
            Array.isArray(store.products) ? store.products : [],
          )
          .filter(
            (product): product is CatalogProduct & { image_path: string } =>
              typeof product.image_path === "string" &&
              product.image_path.trim().length > 0,
          );

        const uniquePaths = [
          ...new Set(imagePaths.map((product) => product.image_path)),
        ];

        const imageUrlEntries = await Promise.all(
          uniquePaths.map(async (path) => {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("delivery-product-images")
                .createSignedUrl(path, 60 * 60);

            if (signedError || !signedData?.signedUrl) {
              return [path, ""] as const;
            }

            return [path, signedData.signedUrl] as const;
          }),
        );

        if (!cancelled) {
          setProductImageUrls(Object.fromEntries(imageUrlEntries));

          setCatalog({
            area: result.area ?? null,
            stores,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "We could not load stores. Please try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [areaSlug]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-violet-700"
          >
            LogisticApp
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={`/cart?area=${encodeURIComponent(areaSlug)}`}
              aria-label={`View cart, ${cartCount} items`}
              className="relative inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-violet-50"
            >
              <span aria-hidden="true" className="text-lg">
                🛒
              </span>
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-700 px-1.5 text-xs font-bold text-white">
                {cartCount}
              </span>
            </Link>

            <Link
              href="/"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Change area
            </Link>
          </div>
        </div>
      </header>

      {cartMessage && (
        <div
          role="status"
          className="fixed right-4 top-20 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            ✓
          </span>
          <p className="text-sm font-medium text-slate-800">{cartMessage}</p>
          <button
            type="button"
            onClick={() => setCartMessage("")}
            aria-label="Dismiss notification"
            className="ml-2 text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      )}

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-violet-700">
            Explore local stores
          </p>

          <p className="mt-3 max-w-2xl text-slate-600">
            Browse available stores and their products in your selected delivery
            area.
          </p>
        </div>

        {!areaSlug && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="text-lg font-semibold">
              Choose a delivery area first
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Select your area before browsing available stores.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white transition hover:bg-violet-800"
            >
              Select delivery area
            </Link>
          </div>
        )}

        {loading && areaSlug && (
          <div
            className="rounded-2xl border border-slate-200 bg-white p-8 text-center"
            role="status"
          >
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-700" />
            <p className="font-medium">Loading available stores...</p>
            <p className="mt-1 text-sm text-slate-500">
              This should only take a moment.
            </p>
          </div>
        )}

        {!loading && areaSlug && errorMessage && (
          <div
            className="rounded-2xl border border-red-200 bg-white p-8"
            role="alert"
          >
            <h2 className="text-lg font-semibold text-red-700">
              We couldn&apos;t load the stores
            </h2>
            <p className="mt-2 wrap-break text-sm text-slate-600">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && areaSlug && !errorMessage && catalog && !catalog.area && (
          <div className="rounded-2xl border border-amber-200 bg-white p-8">
            <h2 className="text-lg font-semibold">
              This delivery area is unavailable
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              It may have been deactivated. Please choose an active area to
              continue.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800"
            >
              Choose another area
            </Link>
          </div>
        )}

        {!loading &&
          areaSlug &&
          !errorMessage &&
          catalog?.area &&
          catalog.stores.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 text-2xl">
                🛍️
              </div>
              <h2 className="text-xl font-semibold">No stores available yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                We haven&apos;t listed any stores in {catalog.area.name} yet.
                Please check back soon.
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex rounded-xl border border-slate-200 px-5 py-3 font-semibold hover:bg-slate-50"
              >
                Change delivery area
              </Link>
            </div>
          )}

        {!loading &&
          !errorMessage &&
          catalog?.area &&
          catalog.stores.length > 0 && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  {catalog.stores.reduce(
                    (total, store) => total + store.products.length,
                    0,
                  )}{" "}
                  products available
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                {catalog.stores.flatMap((store) =>
                  store.products.map((product) => (
                    <article
                      key={`${store.location_id}-${product.id}`}
                      className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 transition hover:border-violet-200 hover:shadow-sm sm:p-4"
                    >
                      <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-xl bg-slate-50">
                        {product.image_path &&
                        productImageUrls[product.image_path] ? (
                          <Image
                            src={productImageUrls[product.image_path]}
                            alt={product.name}
                            fill
                            sizes="(max-width: 639px) 45vw, (max-width: 1023px) 30vw, 23vw"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-3xl">
                            🛍️
                          </div>
                        )}
                      </div>

                      {product.category_name && (
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
                          {product.category_name}
                        </p>
                      )}

                      <h2 className="font-semibold leading-5 text-slate-900">
                        {product.name}
                      </h2>

                      {product.description && (
                        <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">
                          {product.description}
                        </p>
                      )}

                      <div className="mt-auto pt-4">
                        <p className="text-base font-bold text-slate-900 sm:text-lg">
                          {formatPrice(
                            Number(product.price_minor),
                            product.currency,
                          )}
                        </p>

                        {product.preparation_time_minutes != null && (
                          <p className="mt-1 text-xs text-slate-500">
                            {product.preparation_time_minutes} min prep
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={() => addToCart(product, store)}
                          disabled={!cartReady}
                          className="mt-3 w-full rounded-lg bg-violet-700 px-2 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Add to Cart
                        </button>
                      </div>
                    </article>
                  )),
                )}
              </div>
            </div>
          )}
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-slate-500 sm:px-6">
          LogisticApp · Local stores, delivered to you
        </div>
      </footer>
    </main>
  );
}

export default function StoresPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-center text-slate-600">
          Loading store catalog...
        </main>
      }
    >
      <StoreCatalogContent />
    </Suspense>
  );
}
