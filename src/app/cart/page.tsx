"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

import { loadCart, saveCart, getCartCount, CART_UPDATED_EVENT, type CartItem } from "@/lib/cart";

function formatPrice(amountMinor: number, currency: string) {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "NGN";
  const amount = Number(amountMinor);
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(safeAmount / 100);
  } catch {
    return `₦${(safeAmount / 100).toLocaleString("en-NG")}`;
  }
}

function getProductRowKey(item: CartItem): string {
  return JSON.stringify([
    item.storeId,
    item.product.name.trim().toLowerCase(),
    Number(item.product.price_minor),
    item.product.image_path || null,
  ]);
}

// Validate and normalize stored items before displaying or saving them.
function mergeCartItems(items: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>();

  for (const rawItem of items as unknown[]) {
    if (!rawItem || typeof rawItem !== "object") continue;

    const item = rawItem as Partial<CartItem>;
    const product = item.product;

    if (!product || typeof product !== "object") continue;

    const productData = product as CartItem["product"];
    const price = Number(productData.price_minor);
    const quantity = Number(item.quantity);

    if (
      typeof item.storeId !== "string" ||
      !item.storeId.trim() ||
      typeof productData.name !== "string" ||
      !productData.name.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      continue;
    }

    const normalizedItem: CartItem = {
      product: {
        id: String(productData.id ?? ""),
        name: productData.name,
        description: productData.description ?? null,
        price_minor: price,
        currency:
          typeof productData.currency === "string" &&
          /^[A-Z]{3}$/.test(productData.currency)
            ? productData.currency
            : "NGN",
        category_id: productData.category_id ?? null,
        category_name: productData.category_name ?? null,
        preparation_time_minutes: productData.preparation_time_minutes ?? null,
        image_path: productData.image_path || null,
      },
      storeId: item.storeId,
      storeName: typeof item.storeName === "string" ? item.storeName : "Store",
      quantity,
    };

    const key = getProductRowKey(normalizedItem);
    const existing = merged.get(key);

    if (existing) {
      merged.set(key, {
        ...existing,
        quantity: existing.quantity + normalizedItem.quantity,
      });
    } else {
      merged.set(key, normalizedItem);
    }
  }

  return Array.from(merged.values());
}

type CartState = { items: CartItem[]; areaSlug: string };
const emptyCart: CartState = { items: [], areaSlug: "" };
let clientCart: CartState | null = null;
const cartListeners = new Set<() => void>();
function getClientCart(): CartState {
  if (!clientCart) {
    const saved = loadCart();
    clientCart = { items: mergeCartItems(saved.items), areaSlug: saved.areaSlug };
  }

  return clientCart;
}
function subscribeToCart(listener: () => void) {
  const refreshCartFromStorage = () => {
    const saved = loadCart();

    clientCart = {
      items: mergeCartItems(saved.items),
      areaSlug: saved.areaSlug,
    };
  };

  refreshCartFromStorage();
  cartListeners.add(listener);

  const handleCartUpdate = () => {
    refreshCartFromStorage();
    listener();
  };

  window.addEventListener(CART_UPDATED_EVENT, handleCartUpdate);
  window.addEventListener("storage", handleCartUpdate);

  return () => {
    cartListeners.delete(listener);
    window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdate);
    window.removeEventListener("storage", handleCartUpdate);
  };
}


function updateCart(updater: (current: CartState) => CartState) {
  const next = updater(getClientCart());
  clientCart = { ...next, items: mergeCartItems(next.items) };
  saveCart(clientCart);
  cartListeners.forEach((listener) => listener());
}


export default function CartPage() {
  const router = useRouter();
  const cart = useSyncExternalStore(
    subscribeToCart,
    getClientCart,
    () => emptyCart,
  );
  const ready = useSyncExternalStore(
    subscribeToCart,
    () => true,
    () => false,
  );
  const { items, areaSlug } = cart;

  function updateQuantity(rowKey: string, change: number) {
    updateCart((current) => ({
      ...current,
      items: mergeCartItems(current.items)
        .map((item) =>
          getProductRowKey(item) === rowKey
            ? { ...item, quantity: item.quantity + change }
            : item,
        )
        .filter((item) => item.quantity > 0),
    }));
  }

  function removeItem(rowKey: string) {
    updateCart((current) => ({
      ...current,
      items: mergeCartItems(current.items).filter(
        (item) => getProductRowKey(item) !== rowKey,
      ),
    }));
  }

  function clearCart() {
    updateCart((current) => ({ ...current, items: [] }));
  }

  const normalizedItems = mergeCartItems(items);
  const cartCount = getCartCount(normalizedItems);

  const cartTotal = normalizedItems.reduce(
    (total, item) => total + Number(item.product.price_minor) * item.quantity,
    0,
  );

  const currency = normalizedItems[0]?.product.currency ?? "NGN";

  if (!ready) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-center text-slate-600">
        Loading your cart...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href={
              areaSlug ? `/stores?area=${encodeURIComponent(areaSlug)}` : "/"
            }
            className="text-xl font-bold tracking-tight text-violet-700"
          >
            LogisticApp
          </Link>

          <div
            aria-label={`Cart, ${cartCount} items`}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
          >
            <span aria-hidden="true">🛒</span>
            <span>Cart</span>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-700 px-1.5 text-xs font-bold text-white">
              {cartCount}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Your Cart</h1>
            <p className="mt-2 text-sm text-slate-600">
              Review your items before checkout.
            </p>
          </div>

          <Link
            href={
              areaSlug ? `/stores?area=${encodeURIComponent(areaSlug)}` : "/"
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100"
          >
            Continue Shopping
          </Link>
        </div>

        {normalizedItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
            <div className="mb-4 text-5xl" aria-hidden="true">
              🛒
            </div>
            <h2 className="text-xl font-semibold">Your cart is empty</h2>
            <p className="mt-2 text-sm text-slate-600">
              Browse the stores in your delivery area and add some products.
            </p>
            <Link
              href={
                areaSlug ? `/stores?area=${encodeURIComponent(areaSlug)}` : "/"
              }
              className="mt-6 inline-flex rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {normalizedItems.map((item) => {
                const rowKey = getProductRowKey(item);

                return (
                  <article
                    key={rowKey}
                    className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-28">
                      <CartProductImage item={item} />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="text-xs font-medium text-violet-700">
                        {item.storeName}
                      </p>

                      <h2 className="mt-1 font-semibold text-slate-900">
                        {item.product.name}
                      </h2>

                      <p className="mt-1 text-sm font-bold">
                        {formatPrice(
                          Number(item.product.price_minor),
                          item.product.currency,
                        )}
                      </p>

                      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => updateQuantity(rowKey, -1)}
                            aria-label={`Decrease ${item.product.name} quantity`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 font-bold hover:bg-slate-50"
                          >
                            −
                          </button>

                          <span className="min-w-4 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() => updateQuantity(rowKey, 1)}
                            aria-label={`Increase ${item.product.name} quantity`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 font-bold hover:bg-slate-50"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(rowKey)}
                          className="text-sm font-semibold text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              <button
                type="button"
                onClick={clearCart}
                className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-600 hover:text-red-600"
              >
                Clear cart
              </button>
            </div>

            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Order Summary</h2>

              <div className="mt-4 flex justify-between gap-3 text-sm text-slate-600">
                <span>Items ({cartCount})</span>
                <span>{formatPrice(cartTotal, currency)}</span>
              </div>

              <div className="mt-4 flex justify-between gap-3 border-t border-slate-200 pt-4">
                <span className="font-semibold">Subtotal</span>
                <span className="text-lg font-bold">
                  {formatPrice(cartTotal, currency)}
                </span>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Delivery fees and final prices will be confirmed at checkout.
              </p>

              <button
                type="button"
                onClick={() => router.push("/checkout")}
                className="mt-6 w-full rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white transition hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              >
                Proceed to Checkout
              </button>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function CartProductImage({ item }: { item: CartItem }) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      const path = item.product.image_path;

      if (!path) {
        setImageUrl("");
        return;
      }

      const supabase = createClient();

      const { data, error } = await supabase.storage
        .from("delivery-product-images")
        .createSignedUrl(path, 60 * 60);

      if (!cancelled) {
        setImageUrl(!error && data?.signedUrl ? data.signedUrl : "");
      }
    }

    void loadImage();

    return () => {
      cancelled = true;
    };
  }, [item.product.image_path]);

  if (!imageUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center text-3xl">
        🛍️
      </div>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={item.product.name}
      fill
      sizes="112px"
      className="object-cover"
      unoptimized
    />
  );
}
