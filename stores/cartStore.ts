import { create } from "zustand";

import { supabase } from "../lib/supabase";
import {
  queueOfflineTransaction,
  type OfflineSalePayment,
  type QueuedSaleResult,
  type SaleOutputMode,
} from "../lib/offlineSync";

export type PaymentType = "CASH" | "UPI" | "CREDIT" | "SPLIT";
export type CartProductType = "FRESH_SWEET" | "SAVORY" | "PACKAGED_GOOD";

export type CartProduct = {
  id: string;
  name: string;
  product_type: CartProductType;
  unit: string;
  price_per_unit: number;
  barcode?: string | null;
};

export type FefoBatch = {
  id: string;
  quantity_remaining: number;
  expiry_date: string | null;
  received_at: string;
};

export type BatchAllocation = {
  batch_id: string;
  quantity: number;
  expiry_date: string | null;
};

export type CartItem = CartProduct & {
  quantity: number;
  line_total: number;
  batch_allocations: BatchAllocation[];
};

export type FefoResult =
  | { ok: true; allocations: BatchAllocation[] }
  | { ok: false; message: string };

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function allocateFefo(
  batches: FefoBatch[],
  requestedQuantity: number,
  today = localDateString(new Date()),
): FefoResult {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return { ok: false, message: "Quantity must be greater than zero." };
  }

  const eligible = batches
    .filter(
      (batch) =>
        Number.isFinite(batch.quantity_remaining) &&
        batch.quantity_remaining > 0 &&
        (!batch.expiry_date || batch.expiry_date >= today),
    )
    .sort((a, b) => {
      if (a.expiry_date === null && b.expiry_date !== null) return 1;
      if (a.expiry_date !== null && b.expiry_date === null) return -1;
      if (a.expiry_date && b.expiry_date && a.expiry_date !== b.expiry_date) {
        return a.expiry_date.localeCompare(b.expiry_date);
      }
      return (
        a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id)
      );
    });

  let remaining = requestedQuantity;
  const allocations: BatchAllocation[] = [];

  for (const batch of eligible) {
    if (remaining <= 0) break;
    const quantity = Math.min(batch.quantity_remaining, remaining);
    allocations.push({
      batch_id: batch.id,
      quantity,
      expiry_date: batch.expiry_date,
    });
    remaining = Number((remaining - quantity).toFixed(3));
  }

  if (remaining > 0) {
    return {
      ok: false,
      message: "Not enough unexpired stock is available for this product.",
    };
  }

  return { ok: true, allocations };
}

type CartState = {
  items: CartItem[];
  paymentType: PaymentType;
  setPaymentType: (paymentType: PaymentType) => void;
  addItem: (
    product: CartProduct,
    batches: FefoBatch[],
    quantity?: number,
  ) => FefoResult;
  setQuantity: (
    productId: string,
    quantity: number,
    batches: FefoBatch[],
  ) => FefoResult;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  getTotal: () => number;
};

function isPackaged(product: CartProduct): boolean {
  return product.product_type === "PACKAGED_GOOD";
}

function allocateForProduct(
  product: CartProduct,
  batches: FefoBatch[],
  quantity: number,
): FefoResult {
  if (!isPackaged(product)) {
    return { ok: true, allocations: [] };
  }
  return allocateFefo(batches, quantity);
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  paymentType: "CASH",
  setPaymentType: (paymentType) => set({ paymentType }),
  addItem: (product, batches, quantity = 1) => {
    const existing = get().items.find((item) => item.id === product.id);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    const result = allocateForProduct(product, batches, nextQuantity);
    if (!result.ok) return result;

    const nextItem: CartItem = {
      ...product,
      quantity: nextQuantity,
      line_total: Number((nextQuantity * product.price_per_unit).toFixed(2)),
      batch_allocations: result.allocations,
    };
    set((state) => ({
      items: existing
        ? state.items.map((item) => (item.id === product.id ? nextItem : item))
        : [...state.items, nextItem],
    }));
    return result;
  },
  setQuantity: (productId, quantity, batches) => {
    const item = get().items.find((candidate) => candidate.id === productId);
    if (!item) return { ok: false, message: "Cart item was not found." };
    if (quantity <= 0) {
      set((state) => ({
        items: state.items.filter((candidate) => candidate.id !== productId),
      }));
      return { ok: true, allocations: [] };
    }

    const result = allocateForProduct(item, batches, quantity);
    if (!result.ok) return result;
    set((state) => ({
      items: state.items.map((candidate) =>
        candidate.id === productId
          ? {
              ...candidate,
              quantity,
              line_total: Number((quantity * candidate.price_per_unit).toFixed(2)),
              batch_allocations: result.allocations,
            }
          : candidate,
      ),
    }));
    return result;
  },
  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== productId),
    })),
  clearCart: () => set({ items: [], paymentType: "CASH" }),
  getTotal: () => get().items.reduce((total, item) => total + item.line_total, 0),
}));

export async function addProductWithFefoCheck(
  product: CartProduct,
  quantity = 1,
): Promise<FefoResult> {
  let batches: FefoBatch[] = [];

  if (isPackaged(product)) {
    const { data, error } = await supabase
      .from("product_batches")
      .select("id,quantity_remaining,expiry_date,received_at")
      .eq("product_id", product.id)
      .gt("quantity_remaining", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("received_at", { ascending: true });

    if (error) throw new Error(`Could not check packaged stock: ${error.message}`);
    batches = (data ?? []).map((batch) => ({
      id: batch.id,
      quantity_remaining: Number(batch.quantity_remaining),
      expiry_date: batch.expiry_date,
      received_at: batch.received_at,
    }));
  }

  return useCartStore.getState().addItem(product, batches, quantity);
}

export async function checkoutCurrentCartOffline(
  outputMode: SaleOutputMode = "SILENT",
  payments?: OfflineSalePayment[],
): Promise<QueuedSaleResult> {
  const cart = useCartStore.getState();
  if (!cart.items.length) throw new Error("Add at least one product before checkout.");

  const total = Number(cart.getTotal().toFixed(2));
  const result = await queueOfflineTransaction({
    subtotal: total,
    discount: 0,
    tax: 0,
    total,
    payment_mode: cart.paymentType,
    output_mode: outputMode,
    ...(payments ? { payments } : {}),
    items: cart.items.map((item) => ({
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.price_per_unit,
      line_total: item.line_total,
    })),
  });

  useCartStore.getState().clearCart();
  return result;
}
