export type CartProduct = {
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

export type CartItem = {
  product: CartProduct;
  storeId: string;
  storeName: string;
  quantity: number;
};

export type SavedCart = {
  areaSlug: string;
  items: CartItem[];
};

const CART_STORAGE_KEY = "logisticapp-cart-v1";
export const CART_UPDATED_EVENT = "logisticapp-cart-updated";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeCartItem(value: unknown): CartItem | null {
  if (!isRecord(value) || !isRecord(value.product)) {
    return null;
  }

  const rawProduct = value.product;
  const id = rawProduct.id;
  const name = rawProduct.name;
  const storeId = value.storeId;

  const price = Number(rawProduct.price_minor);
  const quantity = Number(value.quantity);

  if (
    typeof id !== "string" ||
    !id.trim() ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof storeId !== "string" ||
    !storeId.trim() ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  const preparationTime = rawProduct.preparation_time_minutes;
  const parsedPreparationTime =
    preparationTime === null || preparationTime === undefined
      ? null
      : Number(preparationTime);

  return {
    product: {
      id,
      name,
      description: nullableString(rawProduct.description),
      price_minor: price,
      currency:
        typeof rawProduct.currency === "string" && rawProduct.currency.trim()
          ? rawProduct.currency
          : "NGN",
      category_id: nullableString(rawProduct.category_id),
      category_name: nullableString(rawProduct.category_name),
      preparation_time_minutes:
        parsedPreparationTime !== null && Number.isFinite(parsedPreparationTime)
          ? parsedPreparationTime
          : null,
      image_path: nullableString(rawProduct.image_path),
    },
    storeId,
    storeName: typeof value.storeName === "string" ? value.storeName : "",
    quantity,
  };
}

function normalizeItems(items: unknown[]): CartItem[] {
  const normalized: CartItem[] = [];

  for (const item of items) {
    const validItem = normalizeCartItem(item);

    if (validItem) {
      normalized.push(validItem);
    }
  }

  return normalized;
}

export function loadCart(): SavedCart {
  if (typeof window === "undefined") {
    return { areaSlug: "", items: [] };
  }

  try {
    const saved = window.localStorage.getItem(CART_STORAGE_KEY);

    if (!saved) {
      return { areaSlug: "", items: [] };
    }

    const parsed: unknown = JSON.parse(saved);

    if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
      return { areaSlug: "", items: [] };
    }

    return {
      areaSlug: typeof parsed.areaSlug === "string" ? parsed.areaSlug : "",
      items: normalizeItems(parsed.items),
    };
  } catch {
    return { areaSlug: "", items: [] };
  }
}

export function saveCart(cart: SavedCart): void {
  if (typeof window === "undefined") return;

  try {
    const safeCart: SavedCart = {
      areaSlug: cart.areaSlug ?? "",
      items: Array.isArray(cart.items) ? cart.items : [],
    };

    const serialized = JSON.stringify(safeCart);
    const previous = window.localStorage.getItem(CART_STORAGE_KEY);

    if (previous === serialized) return;

    window.localStorage.setItem(CART_STORAGE_KEY, serialized);

    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  } catch (error) {
    console.error("Failed to save cart:", error);
  }
}
export function getCartCount(items: CartItem[]): number {
  return items.reduce(
    (total, item) =>
      Number.isSafeInteger(item.quantity) && item.quantity > 0
        ? total + item.quantity
        : total,
    0,
  );
}
