"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

const IMAGE_BUCKET = "delivery-product-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 3600;

type MerchantMembership = {
  merchant_id: string;
  membership_status: string;
  merchant_status: string;
  business_name: string;
};

type Product = {
  id: string;
  merchant_id: string;
  location_id: string | null;
  category_id: string | null;
  category_name: string | null;
  name: string;
  description: string | null;
  sku: string | null;
  price_minor: number | string;
  currency: string;
  status: "draft" | "active" | "unavailable" | "archived";
  image_path: string | null;
  preparation_time_minutes: number | null;
  created_at: string;
  updated_at: string;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
};

type ProductResponse = {
  merchant_id: string;
  products: Product[];
  categories: Category[];
};

type SavedProductResponse = {
  success?: boolean;
  action?: string;
  product?: Product;
};

type Props = {
  memberships: MerchantMembership[];
};

type ProductFormValues = {
  name: string;
  description: string;
  sku: string;
  price: string;
  category_id: string;
  preparation_time_minutes: string;
  status: Product["status"];
};

const emptyProductForm: ProductFormValues = {
  name: "",
  description: "",
  sku: "",
  price: "",
  category_id: "",
  preparation_time_minutes: "",
  status: "draft",
};

const statusLabels: Record<Product["status"], string> = {
  draft: "Draft",
  active: "Active",
  unavailable: "Unavailable",
  archived: "Archived",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20";

const extensionByType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function formatPrice(priceMinor: number | string, currency: string) {
  const amount = Number(priceMinor) / 100;

  if (!Number.isFinite(amount)) return "Price unavailable";

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG")}`;
  }
}

function productToForm(product: Product): ProductFormValues {
  const minor = Number(product.price_minor);

  return {
    name: product.name,
    description: product.description ?? "",
    sku: product.sku ?? "",
    price: Number.isFinite(minor) ? (minor / 100).toFixed(2) : "",
    category_id: product.category_id ?? "",
    preparation_time_minutes:
      product.preparation_time_minutes == null
        ? ""
        : String(product.preparation_time_minutes),
    status: product.status,
  };
}

export default function MerchantProducts({ memberships }: Props) {
  const [selectedMerchantId, setSelectedMerchantId] = useState(
    memberships[0]?.merchant_id ?? "",
  );
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formValues, setFormValues] =
    useState<ProductFormValues>(emptyProductForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!selectedMerchantId) {
      setProducts([]);
      setCategories([]);
      setImageUrls({});
      setSelectedLocationId("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const { data: settingsData, error: settingsError } = await supabase.rpc(
        "get_merchant_store_settings",
        { p_merchant_id: selectedMerchantId },
      );

      if (settingsError) throw settingsError;

      const settings = settingsData as {
        merchant?: { id?: string };
        location?: { id?: string };
      };

      if (
        settings?.merchant?.id !== selectedMerchantId ||
        !settings.location?.id
      ) {
        throw new Error("The store location could not be verified.");
      }

      setSelectedLocationId(settings.location.id);

      const { data, error: rpcError } = await supabase.rpc(
        "get_merchant_products",
        { p_merchant_id: selectedMerchantId },
      );

      if (rpcError) throw rpcError;

      const result = data as ProductResponse;

      if (
        !result ||
        result.merchant_id !== selectedMerchantId ||
        !Array.isArray(result.products) ||
        !Array.isArray(result.categories)
      ) {
        throw new Error("Invalid products response.");
      }

      setProducts(result.products);
      setCategories(result.categories);

      // The bucket is private. Create temporary signed URLs for display.
      const signedUrlEntries = await Promise.all(
        result.products.map(async (product) => {
          if (!product.image_path) {
            return [product.id, ""] as const;
          }

          try {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from(IMAGE_BUCKET)
                .createSignedUrl(product.image_path, SIGNED_URL_TTL_SECONDS);

            if (signedError || !signedData?.signedUrl) {
              console.warn(
                "Unable to create product image URL:",
                product.id,
                signedError,
              );
              return [product.id, ""] as const;
            }

            return [product.id, signedData.signedUrl] as const;
          } catch (signedError) {
            console.warn(
              "Unable to create product image URL:",
              product.id,
              signedError,
            );
            return [product.id, ""] as const;
          }
        }),
      );

      const nextImageUrls: Record<string, string> = {};

      for (const [productId, url] of signedUrlEntries) {
        if (url) nextImageUrls[productId] = url;
      }

      setImageUrls(nextImageUrls);
    } catch (err) {
      console.error("Unable to load merchant products:", err);
      setProducts([]);
      setCategories([]);
      setImageUrls({});
      setError(
        "We couldn't load your products. Please try again. If the problem continues, contact support.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedMerchantId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadProducts]);

  useEffect(() => {
    if (!imagePreviewUrl) return;

    return () => {
      URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (!modalOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        setModalOpen(false);
        setFormError("");
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [modalOpen, saving]);

  function openNewProductModal() {
    setEditingProduct(null);
    setFormValues(emptyProductForm);
    setSelectedImage(null);
    setImagePreviewUrl(null);
    setFormError("");
    setFormSuccess("");
    setModalOpen(true);
  }

  function openEditProductModal(product: Product) {
    setEditingProduct(product);
    setFormValues(productToForm(product));
    setSelectedImage(null);
    setImagePreviewUrl(null);
    setFormError("");
    setFormSuccess("");
    setModalOpen(true);
  }

  function handleImageChange(file: File | null) {
    setFormError("");

    if (!file) {
      setSelectedImage(null);
      setImagePreviewUrl(null);
      return;
    }

    if (!Object.hasOwn(extensionByType, file.type)) {
      setFormError("Choose a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size === 0) {
      setFormError("The selected image is empty. Choose another image.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setFormError("The image must not exceed 5 MB.");
      return;
    }

    setSelectedImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!selectedMerchantId) {
      setFormError("Select a store before saving a product.");
      return;
    }

    if (!selectedLocationId) {
      setFormError(
        "The store location could not be verified. Reload the page and try again.",
      );
      return;
    }

    const name = formValues.name.trim();
    const description = formValues.description.trim();
    const sku = formValues.sku.trim();
    const priceText = formValues.price.trim();

    if (!name || name.length > 180) {
      setFormError("Enter a product name between 1 and 180 characters.");
      return;
    }

    if (description.length > 10000) {
      setFormError("Description must not exceed 10,000 characters.");
      return;
    }

    if (sku.length > 100) {
      setFormError("SKU must not exceed 100 characters.");
      return;
    }

    if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(priceText)) {
      setFormError("Enter a valid price, such as 1500 or 1500.50.");
      return;
    }

    const priceMinor = Math.round(Number(priceText) * 100);

    if (!Number.isSafeInteger(priceMinor)) {
      setFormError("That price is outside the supported range.");
      return;
    }

    const prepText = formValues.preparation_time_minutes.trim();
    let prepMinutes: number | null = null;

    if (prepText !== "") {
      if (!/^\d+$/.test(prepText)) {
        setFormError("Preparation time must be a whole number of minutes.");
        return;
      }

      prepMinutes = Number(prepText);

      if (!Number.isSafeInteger(prepMinutes) || prepMinutes > 1440) {
        setFormError("Preparation time must be between 0 and 1440 minutes.");
        return;
      }
    }

    setSaving(true);

    try {
      const supabase = createClient();

      // First save the product using the existing permission-checked RPC.
      const { data: saveData, error: saveError } = await supabase.rpc(
        "save_merchant_product",
        {
          p_merchant_id: selectedMerchantId,
          p_name: name,
          p_description: description || null,
          p_sku: sku || null,
          p_price_minor: priceMinor,
          p_category_id: formValues.category_id || null,
          p_location_id: editingProduct?.location_id ?? selectedLocationId,
          p_preparation_time_minutes: prepMinutes,
          p_status: formValues.status,
          p_product_id: editingProduct?.id ?? null,
        },
      );

      if (saveError) throw saveError;

      const savedResponse = saveData as SavedProductResponse | null;
      const savedProductId = savedResponse?.product?.id;

      if (
        !savedResponse ||
        savedResponse.success !== true ||
        typeof savedProductId !== "string" ||
        !savedProductId
      ) {
        throw new Error(
          "The product save response did not contain a valid product ID.",
        );
      }

      let imageWasUploaded = false;

      // Upload only when the user selected a new image.
      // If no new image was selected, the existing image is preserved.
      if (selectedImage) {
        const extension = extensionByType[selectedImage.type];

        if (!extension) {
          setFormError("Choose a JPEG, PNG, or WebP image.");
          await loadProducts();
          return;
        }

        const imagePath =
          `${selectedMerchantId}/${savedProductId}/` +
          `${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(imagePath, selectedImage, {
            contentType: selectedImage.type,
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Product image upload failed:", uploadError);

          setFormError(
            "Product details were saved, but the image upload failed. Your previous image, if any, was kept. Please try selecting the image and saving again.",
          );

          await loadProducts();
          return;
        }

        imageWasUploaded = true;

        // Link the successfully uploaded file to the product.
        const { error: imagePathError } = await supabase.rpc(
          "set_merchant_product_image",
          {
            p_merchant_id: selectedMerchantId,
            p_product_id: savedProductId,
            p_image_path: imagePath,
          },
        );

        if (imagePathError) {
          console.error(
            "Unable to link uploaded image to product:",
            imagePathError,
          );

          // Best-effort cleanup of only the newly uploaded, unlinked file.
          // Never remove the product's previous image here.
          const { error: cleanupError } = await supabase.storage
            .from(IMAGE_BUCKET)
            .remove([imagePath]);

          if (cleanupError) {
            console.warn(
              "Could not clean up the unlinked image:",
              cleanupError,
            );
          }

          setFormError(
            "Product details were saved, but we couldn't link the uploaded image. Your previous image, if any, was kept. Please try again.",
          );

          await loadProducts();
          return;
        }
      }

      setModalOpen(false);
      setEditingProduct(null);
      setFormValues(emptyProductForm);
      setSelectedImage(null);
      setImagePreviewUrl(null);

      setFormSuccess(
        imageWasUploaded
          ? editingProduct
            ? "Product updated and image uploaded successfully."
            : "Product created and image uploaded successfully."
          : editingProduct
            ? "Product updated successfully."
            : "Product created successfully.",
      );

      await loadProducts();
    } catch (err) {
      console.error("Unable to save product:", err);
      setFormError(
        "The product could not be saved. Check the fields and your permissions, then try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (memberships.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-slate-900">Products</h1>
        <p className="mt-2 text-sm text-slate-600">
          No active merchant membership is available for this account.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#7C3AED]">
            Merchant workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Products</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage your catalogue, prices, categories and availability.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewProductModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6D28D9] focus:outline-none focus:ring-2 focus:ring-[#7C3AED] focus:ring-offset-2"
        >
          <span className="text-lg leading-none">+</span>
          Add product
        </button>
      </div>

      {memberships.length > 1 && (
        <div className="max-w-md">
          <label
            htmlFor="merchant-select"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Store
          </label>
          <select
            id="merchant-select"
            value={selectedMerchantId}
            onChange={(event) => {
              setSelectedMerchantId(event.target.value);
              setModalOpen(false);
              setEditingProduct(null);
              setSelectedImage(null);
              setImagePreviewUrl(null);
              setFormError("");
              setFormSuccess("");
            }}
            className={inputClass}
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

      {formSuccess && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <span className="font-bold">✓</span>
          <p>{formSuccess}</p>
          <button
            type="button"
            onClick={() => setFormSuccess("")}
            className="ml-auto font-medium hover:underline"
            aria-label="Dismiss message"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total products</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? "—" : products.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Active products</p>
          <p className="mt-2 text-2xl font-bold text-[#7C3AED]">
            {loading
              ? "—"
              : products.filter((product) => product.status === "active")
                  .length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Categories available</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? "—" : categories.length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Product catalogue</h2>
            <p className="mt-1 text-xs text-slate-500">
              Products belonging to your selected store
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#7C3AED] hover:text-[#7C3AED] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-600">Loading products…</p>
        ) : error ? (
          <div className="p-6">
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void loadProducts()}
              className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Try again
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-[#7C3AED]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="h-7 w-7"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 5v14m-7-7h14"
                />
              </svg>
            </div>
            <h3 className="mt-4 font-semibold text-slate-900">
              Your catalogue is empty
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              Add your first product with its price, category and preparation
              time. You can edit the details later.
            </p>
            <button
              type="button"
              onClick={openNewProductModal}
              className="mt-5 rounded-lg bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6D28D9]"
            >
              + Add your first product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-225 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                  <th className="px-5 py-3 font-medium">Prep time</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="transition hover:bg-violet-50/30"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        {imageUrls[product.id] ? (
                          <Image
                            src={imageUrls[product.id]}
                            alt={product.name}
                            width={56}
                            height={56}
                            sizes="56px"
                            loading="lazy"
                            className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                          />
                        ) : (
                          <div
                            aria-label="No product image"
                            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400"
                          >
                            No image
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">
                            {product.name}
                          </p>
                          {product.sku && (
                            <p className="mt-1 text-xs text-slate-500">
                              SKU: {product.sku}
                            </p>
                          )}
                          {product.description && (
                            <p className="mt-1 max-w-sm text-xs text-slate-500">
                              {product.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {product.category_name ?? "Uncategorised"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">
                      {formatPrice(product.price_minor, product.currency)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {product.preparation_time_minutes == null
                        ? "—"
                        : `${product.preparation_time_minutes} min`}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          product.status === "active"
                            ? "bg-violet-100 text-[#6D28D9]"
                            : product.status === "unavailable"
                              ? "bg-amber-100 text-amber-800"
                              : product.status === "archived"
                                ? "bg-slate-200 text-slate-600"
                                : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {statusLabels[product.status] ?? product.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => openEditProductModal(product)}
                        className="rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-[#7C3AED] transition hover:bg-violet-50"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setModalOpen(false);
              setFormError("");
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#7C3AED]">
                  Store catalogue
                </p>
                <h2
                  id="product-modal-title"
                  className="mt-1 text-xl font-bold text-slate-900"
                >
                  {editingProduct ? "Edit product" : "Add new product"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the product details below.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setModalOpen(false);
                  setFormError("");
                }}
                aria-label="Close product form"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-violet-50 hover:text-[#7C3AED] disabled:opacity-50"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m6 6 12 12M18 6 6 18"
                  />
                </svg>
              </button>
            </header>

            <form
              onSubmit={saveProduct}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                <div>
                  <label
                    htmlFor="product-name"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Product name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="product-name"
                    required
                    maxLength={180}
                    autoFocus
                    value={formValues.name}
                    onChange={(event) =>
                      setFormValues({ ...formValues, name: event.target.value })
                    }
                    className={inputClass}
                    placeholder="e.g. Fresh tomatoes"
                  />
                </div>

                <div>
                  <label
                    htmlFor="product-description"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Description
                  </label>
                  <textarea
                    id="product-description"
                    maxLength={10000}
                    rows={3}
                    value={formValues.description}
                    onChange={(event) =>
                      setFormValues({
                        ...formValues,
                        description: event.target.value,
                      })
                    }
                    className={inputClass}
                    placeholder="Describe the product, size or quantity"
                  />
                </div>

                <div>
                  <label
                    htmlFor="product-image"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Product image
                    <span className="ml-2 font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>

                  <input
                    id="product-image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      handleImageChange(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                    className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#7C3AED]`}
                  />

                  <p className="mt-1.5 text-xs text-slate-500">
                    JPEG, PNG, or WebP. Maximum file size: 5 MB.
                  </p>

                  {imagePreviewUrl ? (
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-medium text-slate-600">
                        Selected image preview
                      </p>

                      <div className="flex items-start gap-3">
                        <Image
                          src={imagePreviewUrl}
                          alt="Selected product image preview"
                          width={112}
                          height={112}
                          sizes="112px"
                          className="h-28 w-28 shrink-0 rounded-lg border border-slate-200 object-cover"
                          unoptimized
                        />

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImage(null);
                            setImagePreviewUrl(null);
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Remove selection
                        </button>
                      </div>
                    </div>
                  ) : editingProduct?.image_path ? (
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-medium text-slate-600">
                        Current image
                      </p>

                      {imageUrls[editingProduct.id] ? (
                        <Image
                          src={imageUrls[editingProduct.id]}
                          alt={`Current image for ${editingProduct.name}`}
                          width={112}
                          height={112}
                          sizes="112px"
                          className="h-28 w-28 rounded-lg border border-slate-200 object-cover"
                        />
                      ) : (
                        <p className="text-xs text-slate-500">
                          The current image preview is unavailable. You can
                          select a new image to replace it.
                        </p>
                      )}

                      <p className="mt-2 text-xs text-slate-500">
                        The current image will be kept unless a new image is
                        uploaded successfully.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="product-price"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Price (₦) <span className="text-red-600">*</span>
                    </label>
                    <div className="flex overflow-hidden rounded-lg border border-slate-300 focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#7C3AED]/20">
                      <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                        ₦
                      </span>
                      <input
                        id="product-price"
                        required
                        inputMode="decimal"
                        value={formValues.price}
                        onChange={(event) =>
                          setFormValues({
                            ...formValues,
                            price: event.target.value,
                          })
                        }
                        className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"
                        placeholder="1500.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="product-sku"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      SKU <span className="text-slate-400">(optional)</span>
                    </label>
                    <input
                      id="product-sku"
                      maxLength={100}
                      value={formValues.sku}
                      onChange={(event) =>
                        setFormValues({
                          ...formValues,
                          sku: event.target.value,
                        })
                      }
                      className={inputClass}
                      placeholder="e.g. TOM-001"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="product-category"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Category
                    </label>
                    <select
                      id="product-category"
                      value={formValues.category_id}
                      onChange={(event) =>
                        setFormValues({
                          ...formValues,
                          category_id: event.target.value,
                        })
                      }
                      className={inputClass}
                    >
                      <option value="">No category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="product-prep"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Preparation time
                    </label>
                    <div className="relative">
                      <input
                        id="product-prep"
                        type="number"
                        min={0}
                        max={1440}
                        step={1}
                        value={formValues.preparation_time_minutes}
                        onChange={(event) =>
                          setFormValues({
                            ...formValues,
                            preparation_time_minutes: event.target.value,
                          })
                        }
                        className={inputClass}
                        placeholder="15"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        minutes
                      </span>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="product-status"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Product status
                    </label>
                    <select
                      id="product-status"
                      value={formValues.status}
                      onChange={(event) =>
                        setFormValues({
                          ...formValues,
                          status: event.target.value as Product["status"],
                        })
                      }
                      className={inputClass}
                    >
                      <option value="draft">Draft — not published</option>
                      <option value="active">
                        Active — available for sale
                      </option>
                      <option value="unavailable">
                        Unavailable — temporarily out of stock
                      </option>
                      <option value="archived">
                        Archived — no longer offered
                      </option>
                    </select>
                    {formValues.status === "active" && (
                      <p className="mt-2 text-xs text-slate-500">
                        Your store and selected location must be active before
                        this product can be activated.
                      </p>
                    )}
                  </div>
                </div>

                {formError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  >
                    {formError}
                  </div>
                )}
              </div>

              <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setModalOpen(false);
                    setFormError("");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6D28D9] focus:outline-none focus:ring-2 focus:ring-[#7C3AED] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? selectedImage
                      ? "Saving and uploading…"
                      : "Saving…"
                    : editingProduct
                      ? "Save changes"
                      : "Create product"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
