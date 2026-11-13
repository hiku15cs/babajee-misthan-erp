import {
  queueOfflineTransaction,
  startOfflineSyncManager,
  syncPendingTransactions,
} from "./offlineSync.native";

export type SalePaymentMode = "CASH" | "UPI" | "CREDIT" | "SPLIT";
export type SaleOutputMode =
  | "TOKEN_ONLY"
  | "BILL_ONLY"
  | "TOKEN_AND_BILL"
  | "SILENT";

export type OfflineSaleItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};

export type OfflineSalePayment = {
  payment_mode: Exclude<SalePaymentMode, "SPLIT">;
  amount: number;
  reference?: string | null;
};

export type OfflineSale = {
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  payment_mode: SalePaymentMode;
  output_mode?: SaleOutputMode;
  notes?: string | null;
  created_at?: string;
  items: OfflineSaleItem[];
  payments?: OfflineSalePayment[];
};

export type SyncResult = {
  synced: number;
  pending: number;
  failures: Array<{ operationId: string; message: string }>;
};

export type QueuedSaleResult = {
  operationId: string;
  synced: boolean;
  syncError?: string;
};

export { queueOfflineTransaction, startOfflineSyncManager, syncPendingTransactions };
