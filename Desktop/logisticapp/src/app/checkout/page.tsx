"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CART_UPDATED_EVENT,
  loadCart,
  type CartItem,
  type SavedCart,
} from "@/lib/cart";

type CheckoutResponse = {
  order_id?: string;
  order_number?: string | number;
  payment_id?: string;
  order_status?: string;
  payment_status?: string;
  total_minor?: number;
  currency?: string;
  guest_tracking_token?: string;
  error?: string;
  message?: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type CheckoutRequest = {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_instructions: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  items: { product_id: string; quantity: number }[];
};

type CheckoutDraft = {
  version: 1;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryInstructions: string;
  coordinates: Coordinates | null;
  updatedAt: number;
};

type CheckoutAttemptRecord = {
  version: 2;
  fingerprint: string;
  idempotencyKey: string;
  request: CheckoutRequest;
  guestSessionToken: string | null;
  state: "pending" | "succeeded";
  response?: CheckoutResponse;
};

type LegacyAttemptRecord = {
  fingerprint: string;
  idempotencyKey: string;
};

const GUEST_SESSION_KEY = "logisticapp-guest-checkout-session-v1";
const CHECKOUT_ATTEMPT_STORAGE_KEY = "logisticapp-checkout-attempt-v1";
const CHECKOUT_DRAFT_STORAGE_KEY = "logisticapp-checkout-draft-v1";

function makeRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createCheckoutFingerprint(request: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(request));
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getGuestSessionToken(): string {
  const existing = window.localStorage.getItem(GUEST_SESSION_KEY);

  if (existing && /^[a-f0-9]{64}$/.test(existing)) {
    return existing;
  }

  const token = makeRandomHex(32);
  window.localStorage.setItem(GUEST_SESSION_KEY, token);

  return token;
}

// NEW: Read the independent form draft.
function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const saved = window.localStorage.getItem(CHECKOUT_DRAFT_STORAGE_KEY);

    if (!saved) return null;

    const parsed = JSON.parse(saved) as Partial<CheckoutDraft>;

    if (
      parsed.version !== 1 ||
      typeof parsed.customerName !== "string" ||
      typeof parsed.customerPhone !== "string" ||
      typeof parsed.deliveryAddress !== "string" ||
      typeof parsed.deliveryInstructions !== "string"
    ) {
      return null;
    }

    let coordinates: Coordinates | null = null;

    if (parsed.coordinates !== null && parsed.coordinates !== undefined) {
      const latitude = parsed.coordinates.latitude;
      const longitude = parsed.coordinates.longitude;

      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return null;
      }

      coordinates = { latitude, longitude };
    }

    return {
      version: 1,
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
      deliveryAddress: parsed.deliveryAddress,
      deliveryInstructions: parsed.deliveryInstructions,
      coordinates,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

// NEW: Save the current form without creating an order.
function saveCheckoutDraft(draft: CheckoutDraft): void {
  window.localStorage.setItem(
    CHECKOUT_DRAFT_STORAGE_KEY,
    JSON.stringify(draft),
  );
}

function readSavedAttempt():
  | CheckoutAttemptRecord
  | LegacyAttemptRecord
  | null {
  try {
    const saved = window.localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);

    if (!saved) return null;

    const parsed = JSON.parse(saved) as Partial<CheckoutAttemptRecord>;

    if (
      typeof parsed.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(parsed.fingerprint) ||
      typeof parsed.idempotencyKey !== "string" ||
      !/^[a-f0-9]{32}$/.test(parsed.idempotencyKey)
    ) {
      return null;
    }

    if (parsed.version !== 2) {
      return {
        fingerprint: parsed.fingerprint,
        idempotencyKey: parsed.idempotencyKey,
      };
    }

    if (
      !parsed.request ||
      typeof parsed.request.customer_name !== "string" ||
      typeof parsed.request.customer_phone !== "string" ||
      typeof parsed.request.delivery_address !== "string" ||
      typeof parsed.request.delivery_instructions !== "string" ||
      !Number.isFinite(parsed.request.dropoff_latitude) ||
      !Number.isFinite(parsed.request.dropoff_longitude) ||
      !Array.isArray(parsed.request.items) ||
      (parsed.state !== "pending" && parsed.state !== "succeeded")
    ) {
      return null;
    }

    return parsed as CheckoutAttemptRecord;
  } catch {
    return null;
  }
}

function saveAttempt(attempt: CheckoutAttemptRecord): void {
  try {
    window.localStorage.setItem(
      CHECKOUT_ATTEMPT_STORAGE_KEY,
      JSON.stringify(attempt),
    );
  } catch {
    throw new Error(
      "Your browser couldn't save checkout recovery information. Please enable site storage and try again.",
    );
  }
}

function formatMoney(amountMinor: number, currency = "NGN"): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default function CheckoutPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [cart, setCart] = useState<SavedCart>({
    areaSlug: "",
    items: [],
  });

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);

  const [locationMessage, setLocationMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);

  const submissionInFlight = useRef(false);

  const [confirmation, setConfirmation] = useState<CheckoutResponse | null>(
    null,
  );

  const [savedAttempt, setSavedAttempt] = useState<
    CheckoutAttemptRecord | LegacyAttemptRecord | null
  >(null);

  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  const refreshCart = useCallback(() => {
    setCart(loadCart());
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(refreshCart);

    window.addEventListener(CART_UPDATED_EVENT, refreshCart);
    window.addEventListener("storage", refreshCart);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener(CART_UPDATED_EVENT, refreshCart);
      window.removeEventListener("storage", refreshCart);
    };
  }, [refreshCart]);

  // Restore the submitted attempt first, otherwise restore the form draft.
  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const attempt = readSavedAttempt();
      const draft = readCheckoutDraft();

      if (attempt) {
        setSavedAttempt(attempt);
      }

      if (attempt && "request" in attempt) {
        // An attempt that may have reached the backend takes priority.
        setCustomerName(attempt.request.customer_name);
        setCustomerPhone(attempt.request.customer_phone);
        setDeliveryAddress(attempt.request.delivery_address);
        setDeliveryInstructions(attempt.request.delivery_instructions);

        setCoordinates({
          latitude: attempt.request.dropoff_latitude,
          longitude: attempt.request.dropoff_longitude,
        });

        if (attempt.state === "succeeded" && attempt.response?.order_id) {
          setConfirmation(attempt.response);
        }
      } else if (draft) {
        // NEW: Restore details even if checkout has never been submitted.
        setCustomerName(draft.customerName);
        setCustomerPhone(draft.customerPhone);
        setDeliveryAddress(draft.deliveryAddress);
        setDeliveryInstructions(draft.deliveryInstructions);
        setCoordinates(draft.coordinates);
        setHasSavedDraft(true);
      }

      setIsRecoveryReady(true);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  // NEW: Autosave the form whenever a customer changes a field.
  // Wait until restoration finishes to avoid overwriting saved data with
  // the initial empty form values.
  useEffect(() => {
    if (!isRecoveryReady || confirmation) return;

    const draft: CheckoutDraft = {
      version: 1,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryInstructions,
      coordinates,
      updatedAt: Date.now(),
    };

    try {
      saveCheckoutDraft(draft);
    } catch {
      // Draft storage is best-effort. Submission recovery still has its
      // own required save-before-network-request protection.
    }
  }, [
    isRecoveryReady,
    confirmation,
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryInstructions,
    coordinates,
  ]);

  const totalItems = cart.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  const subtotalMinor = cart.items.reduce(
    (total, item) => total + item.product.price_minor * item.quantity,
    0,
  );

  const merchantGroups = useMemo(() => {
    const groups = new Map<string, CartItem[]>();

    for (const item of cart.items) {
      const group = groups.get(item.storeId) ?? [];
      group.push(item);
      groups.set(item.storeId, group);
    }

    return Array.from(groups.entries()).map(([storeId, items]) => ({
      storeId,
      storeName: items[0]?.storeName || "Merchant",
      items,
    }));
  }, [cart.items]);

  function clearCheckoutError() {
    setErrorMessage("");
  }

  function handleUseLocation() {
    setErrorMessage("");
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocationMessage(
        "Location is not supported by this browser. Please use a supported browser.",
      );
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        setLocationMessage("Delivery coordinates captured.");
        setIsLocating(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access in your browser and try again."
            : error.code === error.TIMEOUT
              ? "Getting your location took too long. Please try again."
              : "We couldn't get your location. Please try again.";

        setLocationMessage(message);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submissionInFlight.current) return;

    setErrorMessage("");
    setConfirmation(null);

    if (!isRecoveryReady) {
      setErrorMessage(
        "Checkout recovery is still loading. Please try again in a moment.",
      );
      return;
    }

    if (cart.items.length === 0) {
      setErrorMessage("Your cart is empty. Add items before checking out.");
      return;
    }

    if (!coordinates) {
      setErrorMessage(
        "Please use the location button to capture your delivery coordinates.",
      );
      return;
    }

    if (
      !Number.isFinite(coordinates.latitude) ||
      !Number.isFinite(coordinates.longitude) ||
      coordinates.latitude < -90 ||
      coordinates.latitude > 90 ||
      coordinates.longitude < -180 ||
      coordinates.longitude > 180
    ) {
      setErrorMessage("Your delivery coordinates are invalid.");
      return;
    }

    submissionInFlight.current = true;
    setIsSubmitting(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(
          "We couldn't check your sign-in session. Please try again.",
        );
      }

      const guestSessionToken = session ? null : getGuestSessionToken();

      const quantitiesByProduct = new Map<string, number>();

      for (const item of cart.items) {
        const productId = item.product.id.toLowerCase();

        quantitiesByProduct.set(
          productId,
          (quantitiesByProduct.get(productId) ?? 0) + item.quantity,
        );
      }

      const requestItems = Array.from(quantitiesByProduct.entries())
        .map(([product_id, quantity]) => ({
          product_id,
          quantity,
        }))
        .sort((a, b) => a.product_id.localeCompare(b.product_id));

      const currentRequest: CheckoutRequest = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        delivery_address: deliveryAddress.trim(),
        delivery_instructions: deliveryInstructions.trim(),
        dropoff_latitude: coordinates.latitude,
        dropoff_longitude: coordinates.longitude,
        items: requestItems,
      };

      const identity = session
        ? {
            type: "customer",
            userId: session.user.id,
          }
        : {
            type: "guest",
            guestSessionToken,
          };

      const fingerprint = await createCheckoutFingerprint({
        identity,
        ...currentRequest,
      });

      let attempt: CheckoutAttemptRecord;

      if (savedAttempt) {
        if (savedAttempt.fingerprint !== fingerprint) {
          throw new Error(
            "A previous checkout attempt may still have created an order. Restore the original checkout details and retry that attempt before starting a different order. Reload this page to restore the saved details.",
          );
        }

        if ("request" in savedAttempt) {
          attempt = {
            ...savedAttempt,
            state: "pending",
            response: undefined,
          };
        } else {
          attempt = {
            version: 2,
            fingerprint,
            idempotencyKey: savedAttempt.idempotencyKey,
            request: currentRequest,
            guestSessionToken,
            state: "pending",
          };
        }
      } else {
        attempt = {
          version: 2,
          fingerprint,
          idempotencyKey: makeRandomHex(16),
          request: currentRequest,
          guestSessionToken,
          state: "pending",
        };
      }

      // Save the attempt before contacting the backend.
      saveAttempt(attempt);
      setSavedAttempt(attempt);

      const body: Record<string, unknown> = {
        ...attempt.request,
        idempotency_key: attempt.idempotencyKey,
      };

      if (attempt.guestSessionToken) {
        body.guest_session_token = attempt.guestSessionToken;
      }

      const { data, error } = await supabase.functions.invoke<CheckoutResponse>(
        "clever-processor",
        {
          body,
          headers: session
            ? {
                Authorization: `Bearer ${session.access_token}`,
              }
            : { Authorization: "" },
        },
      );

      if (error) {
        throw new Error(
          "We couldn't confirm the checkout result. Your attempt has been saved. Retry with the same details; do not start a different order until this attempt is resolved.",
        );
      }

      if (
        !data ||
        typeof data.order_id !== "string" ||
        data.order_id.trim() === "" ||
        typeof data.payment_id !== "string" ||
        data.payment_id.trim() === "" ||
        typeof data.order_status !== "string" ||
        data.order_status.trim() === "" ||
        typeof data.payment_status !== "string" ||
        data.payment_status.trim() === "" ||
        typeof data.total_minor !== "number" ||
        !Number.isSafeInteger(data.total_minor) ||
        data.total_minor < 0 ||
        data.currency !== "NGN"
      ) {
        throw new Error(
          "The checkout response was incomplete or unexpected. Your attempt has been saved so you can safely retry it with the same details.",
        );
      }

      const successfulAttempt: CheckoutAttemptRecord = {
        ...attempt,
        state: "succeeded",
        response: data,
      };

      saveAttempt(successfulAttempt);
      setSavedAttempt(successfulAttempt);
      setConfirmation(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while checking out. The attempt has been saved for recovery.",
      );
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  function handleContinueShopping() {
    try {
      window.localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
      window.localStorage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
    } catch {
      setErrorMessage(
        "Your order was created, but checkout recovery information could not be cleared. Please keep this page open while you continue.",
      );
      return;
    }

    setSavedAttempt(null);
    setConfirmation(null);
    setHasSavedDraft(false);
    router.push("/stores");
  }

  if (!isRecoveryReady) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6">
          <h1 className="text-2xl font-bold">Checkout</h1>
          <p className="mt-3 text-sm text-gray-600">
            Restoring your checkout information...
          </p>
        </div>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
            ✓
          </div>

          <h1 className="text-2xl font-bold">Order created</h1>

          <p className="mt-3 text-sm leading-6 text-gray-600">
            Your order record has been created. This does not mean payment has
            been completed.
          </p>

          {confirmation.order_number !== undefined && (
            <div className="mt-6 rounded-xl bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Order number</p>
              <p className="mt-1 font-semibold">{confirmation.order_number}</p>
            </div>
          )}

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Order status</span>
              <span className="font-medium">
                {confirmation.order_status || "Pending payment"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Payment status</span>
              <span className="font-medium">
                {confirmation.payment_status || "Initiated"}
              </span>
            </div>

            {typeof confirmation.total_minor === "number" && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Order total</span>
                <span className="font-semibold">
                  {formatMoney(
                    confirmation.total_minor,
                    confirmation.currency || "NGN",
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Payment initiation and verification have not yet been connected. Do
            not assume this order is paid or ready for delivery.
          </div>

          {confirmation.guest_tracking_token && (
            <div className="mt-5 rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-semibold">Guest tracking token</p>
              <p className="mt-2 break-all font-mono text-xs text-gray-600">
                {confirmation.guest_tracking_token}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Keep this token private. Guest order tracking has not yet been
                connected to a tracking page.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleContinueShopping}
            className="mt-7 w-full rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white transition hover:bg-gray-800"
          >
            Continue shopping
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link
            href="/cart"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            ← Back to cart
          </Link>

          <h1 className="mt-4 text-3xl font-bold tracking-tight">Checkout</h1>

          <p className="mt-2 text-sm text-gray-600">
            Confirm your delivery details and review your order.
          </p>
        </div>

        {savedAttempt && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
          >
            {"request" in savedAttempt && savedAttempt.state === "pending"
              ? "A previous checkout attempt is saved. Its original details and key will be reused when you retry. If the outcome is uncertain, do not change the order details."
              : "A previous checkout attempt is saved. Reloading this page restores its saved details."}
          </div>
        )}

        {!savedAttempt && hasSavedDraft && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"
          >
            Your saved checkout details have been restored. You can continue
            filling in the form without starting an order.
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"
          >
            {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_380px]">
          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
          >
            <section>
              <h2 className="text-lg font-semibold">Contact information</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter the details the delivery team can use to reach you.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="customer-name"
                    className="mb-2 block text-sm font-medium"
                  >
                    Full name
                  </label>
                  <input
                    id="customer-name"
                    name="customer_name"
                    autoComplete="name"
                    required
                    maxLength={160}
                    value={customerName}
                    onChange={(event) => {
                      setCustomerName(event.target.value);
                      clearCheckoutError();
                    }}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="customer-phone"
                    className="mb-2 block text-sm font-medium"
                  >
                    Phone number
                  </label>
                  <input
                    id="customer-phone"
                    name="customer_phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    minLength={5}
                    maxLength={30}
                    value={customerPhone}
                    onChange={(event) => {
                      setCustomerPhone(event.target.value);
                      clearCheckoutError();
                    }}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>
            </section>

            <div className="border-t border-gray-100" />

            <section>
              <h2 className="text-lg font-semibold">Delivery address</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter the address where you want your order delivered.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="delivery-address"
                    className="mb-2 block text-sm font-medium"
                  >
                    Full delivery address
                  </label>
                  <textarea
                    id="delivery-address"
                    name="delivery_address"
                    autoComplete="street-address"
                    required
                    minLength={5}
                    maxLength={1000}
                    rows={3}
                    value={deliveryAddress}
                    onChange={(event) => {
                      setDeliveryAddress(event.target.value);
                      clearCheckoutError();
                    }}
                    className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
                    placeholder="House number, street, area, city"
                  />
                </div>

                <div>
                  <label
                    htmlFor="delivery-instructions"
                    className="mb-2 block text-sm font-medium"
                  >
                    Delivery instructions{" "}
                    <span className="font-normal text-gray-500">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="delivery-instructions"
                    name="delivery_instructions"
                    maxLength={1000}
                    rows={2}
                    value={deliveryInstructions}
                    onChange={(event) => {
                      setDeliveryInstructions(event.target.value);
                      clearCheckoutError();
                    }}
                    className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
                    placeholder="Nearby landmark, gate details, or other directions"
                  />
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Delivery coordinates
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Required to calculate delivery distance and fee.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleUseLocation}
                      disabled={isLocating}
                      className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLocating
                        ? "Getting location..."
                        : coordinates
                          ? "Update my location"
                          : "Use my location"}
                    </button>
                  </div>

                  {coordinates && (
                    <p className="mt-3 break-all text-xs text-gray-600">
                      Latitude: {coordinates.latitude.toFixed(6)} · Longitude:{" "}
                      {coordinates.longitude.toFixed(6)}
                    </p>
                  )}

                  {locationMessage && (
                    <p
                      role="status"
                      className="mt-3 text-sm leading-5 text-gray-600"
                    >
                      {locationMessage}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                isLocating ||
                cart.items.length === 0 ||
                !isRecoveryReady
              }
              className="w-full rounded-xl bg-gray-900 px-5 py-3.5 font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Creating order..." : "Place order"}
            </button>

            <p className="text-xs leading-5 text-gray-500">
              Submitting creates an order request. Payment and delivery
              confirmation will be available after those integrations are
              implemented.
            </p>
          </form>

          <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-6">
            <h2 className="text-lg font-semibold">Order summary</h2>

            <p className="mt-1 text-sm text-gray-500">
              {totalItems} {totalItems === 1 ? "item" : "items"} in your cart
            </p>

            {cart.items.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500">Your cart is empty.</p>
                <Link
                  href="/stores"
                  className="mt-4 inline-block text-sm font-semibold underline"
                >
                  Browse stores
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-6">
                  {merchantGroups.map((group) => (
                    <section key={group.storeId}>
                      <h3 className="mb-3 text-sm font-semibold">
                        {group.storeName}
                      </h3>

                      <div className="space-y-4">
                        {group.items.map((item, index) => (
                          <div
                            key={`${item.product.id}-${index}`}
                            className="flex justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium">
                                {item.product.name}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                Qty: {item.quantity}
                              </p>
                            </div>

                            <p className="shrink-0 text-sm font-medium">
                              {formatMoney(
                                item.product.price_minor * item.quantity,
                                item.product.currency || "NGN",
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="mt-6 space-y-3 border-t border-gray-200 pt-5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">Subtotal (estimate)</span>
                    <span className="font-semibold">
                      {formatMoney(subtotalMinor)}
                    </span>
                  </div>

                  <p className="text-xs leading-5 text-gray-500">
                    Final prices and delivery fees are calculated by the
                    backend. The subtotal shown here is for review only.
                  </p>
                </div>

                <Link
                  href="/cart"
                  className="mt-5 block text-center text-sm font-semibold underline underline-offset-4"
                >
                  Edit cart
                </Link>
              </>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
