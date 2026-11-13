import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import { supabase } from "./supabase";
import type {
  OfflineSale,
  QueuedSaleResult,
  SyncResult,
} from "./offlineSync";
import { syncPendingInventoryOperations } from "./inventoryOutbox";

const DATABASE_NAME = "babajee-sales.db";

type PendingTransaction = {
  id: string;
  user_id: string;
  payload: string;
  created_at: string;
};

type SalePayload = OfflineSale & { created_at: string };

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;
let syncPromise: Promise<SyncResult> | undefined;
let syncRequested = false;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS offline_transactions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1)),
          remote_transaction_id TEXT,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS offline_transactions_pending_idx
          ON offline_transactions (user_id, synced, created_at);
      `);
      return database;
    })();
  }
  return databasePromise;
}

function validateSale(sale: OfflineSale): void {
  const discount = sale.discount ?? 0;
  const tax = sale.tax ?? 0;
  const amounts = [sale.subtotal, discount, tax, sale.total];
  if (amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
    throw new Error("Sale totals must be valid non-negative amounts.");
  }
  if (
    discount > sale.subtotal ||
    Math.round((sale.subtotal - discount + tax) * 100) !==
      Math.round(sale.total * 100)
  ) {
    throw new Error("Sale total must equal subtotal minus discount plus tax.");
  }
  if (
    sale.created_at &&
    (!Number.isFinite(Date.parse(sale.created_at)) ||
      Date.parse(sale.created_at) > Date.now() + 5 * 60 * 1000)
  ) {
    throw new Error("Sale timestamp must be valid and cannot be in the future.");
  }
  if (!sale.items.length) throw new Error("A sale must contain at least one item.");
  for (const item of sale.items) {
    if (
      !item.product_id ||
      !item.product_name.trim() ||
      !item.unit.trim() ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.unit_price) ||
      item.unit_price < 0 ||
      !Number.isFinite(item.line_total) ||
      item.line_total < 0
      || Math.round(item.quantity * 1000) / 1000 !== item.quantity
      || Math.round(item.unit_price * 100) / 100 !== item.unit_price
      || Math.round(item.line_total * 100) / 100 !== item.line_total
      || Math.round(item.quantity * item.unit_price * 100) / 100 !==
        Math.round(item.line_total * 100) / 100
    ) {
      throw new Error("Sale contains an invalid line item.");
    }
  }
  if (sale.payment_mode === "SPLIT") {
    const payments = sale.payments ?? [];
    if (
      !payments.length ||
      payments.some(
        (payment) =>
          !Number.isFinite(payment.amount) || payment.amount <= 0,
      ) ||
      payments.some(
        (payment) => Math.round(payment.amount * 100) / 100 !== payment.amount,
      ) ||
      Math.abs(
        payments.reduce((sum, payment) => sum + payment.amount, 0) - sale.total,
      ) > 0.01
    ) {
      throw new Error("Split payments must be positive and add up to the sale total.");
    }
  }
}

async function runSync(): Promise<SyncResult> {
  const network = await NetInfo.fetch();
  if (!network.isConnected || network.isInternetReachable === false) {
    const database = await getDatabase();
    const pending = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM offline_transactions WHERE synced = 0",
    );
    return { synced: 0, pending: pending?.count ?? 0, failures: [] };
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Could not read the signed-in user for sales sync: ${sessionError.message}`);
  }
  const userId = sessionData.session?.user.id;
  if (!userId) {
    const database = await getDatabase();
    const pending = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM offline_transactions WHERE synced = 0",
    );
    return { synced: 0, pending: pending?.count ?? 0, failures: [] };
  }

  const database = await getDatabase();
  const queue = await database.getAllAsync<PendingTransaction>(
    `SELECT id, user_id, payload, created_at
     FROM offline_transactions
     WHERE synced = 0 AND user_id = ?
     ORDER BY created_at, id`,
    userId,
  );
  const failures: SyncResult["failures"] = [];
  let synced = 0;

  for (const operation of queue) {
    try {
      const sale = JSON.parse(operation.payload) as SalePayload;
      const { data, error } = await supabase.rpc("sync_offline_transaction", {
        p_client_operation_id: operation.id,
        p_sale: sale,
      });
      if (error) throw new Error(error.message);
      await database.runAsync(
        `UPDATE offline_transactions
         SET synced = 1, remote_transaction_id = ?, last_error = NULL
         WHERE id = ? AND user_id = ?`,
        String(data),
        operation.id,
        userId,
      );
      synced += 1;
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : String(syncError);
      await database.runAsync(
        "UPDATE offline_transactions SET last_error = ? WHERE id = ? AND user_id = ?",
        message,
        operation.id,
        userId,
      );
      failures.push({ operationId: operation.id, message });
    }
  }

  const pending = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM offline_transactions WHERE synced = 0",
  );
  return { synced, pending: pending?.count ?? 0, failures };
}

export function syncPendingTransactions(): Promise<SyncResult> {
  if (syncPromise) {
    syncRequested = true;
    return syncPromise;
  }
  syncPromise = (async () => {
    let synced = 0;
    let pending = 0;
    const failures = new Map<string, string>();
    do {
      syncRequested = false;
      const result = await runSync();
      synced += result.synced;
      pending = result.pending;
      for (const failure of result.failures) {
        failures.set(failure.operationId, failure.message);
      }
    } while (syncRequested);
    return {
      synced,
      pending,
      failures: [...failures].map(([operationId, message]) => ({
        operationId,
        message,
      })),
    };
  })().finally(() => {
    syncPromise = undefined;
  });
  return syncPromise;
}

export async function queueOfflineTransaction(
  sale: OfflineSale,
): Promise<QueuedSaleResult> {
  validateSale(sale);
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Could not verify the cashier session: ${sessionError.message}`);
  }
  const userId = sessionData.session?.user.id;
  if (!userId) {
    throw new Error("A signed-in cashier is required to save a sale on this device.");
  }

  const operationId = Crypto.randomUUID();
  const createdAt = sale.created_at ?? new Date().toISOString();
  const payload: SalePayload = { ...sale, created_at: createdAt };
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO offline_transactions (id, user_id, payload, created_at, synced)
     VALUES (?, ?, ?, ?, 0)`,
    operationId,
    userId,
    JSON.stringify(payload),
    createdAt,
  );

  try {
    const result = await syncPendingTransactions();
    const stillPending = await database.getFirstAsync<{ synced: number }>(
      "SELECT synced FROM offline_transactions WHERE id = ?",
      operationId,
    );
    const failure = result.failures.find((entry) => entry.operationId === operationId);
    return {
      operationId,
      synced: stillPending?.synced === 1,
      ...(failure ? { syncError: failure.message } : {}),
    };
  } catch (syncError) {
    return {
      operationId,
      synced: false,
      syncError: syncError instanceof Error ? syncError.message : String(syncError),
    };
  }
}

export function startOfflineSyncManager(): () => void {
  let active = true;
  let syncing = false;
  let requestedWhileSyncing = false;

  const syncAll = async () => {
    if (!active) return;
    if (syncing) {
      requestedWhileSyncing = true;
      return;
    }
    syncing = true;
    do {
      requestedWhileSyncing = false;
      try {
        const salesResult = await syncPendingTransactions();
        if (salesResult.failures.length) {
          console.error("Some offline sales could not sync", salesResult.failures);
        }
      } catch (error) {
        console.error("Could not sync offline sales", error);
      }
      try {
        await syncPendingInventoryOperations();
      } catch (error) {
        console.error("Could not sync offline inventory operations", error);
      }
    } while (active && requestedWhileSyncing);
    syncing = false;
  };

  const unsubscribeNetwork = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void syncAll();
  });
  const appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") void syncAll();
  });
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session) setTimeout(() => void syncAll(), 0);
  });
  void NetInfo.fetch().then((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void syncAll();
  }).catch((error: unknown) => {
    console.error("Could not check network status for offline sync", error);
  });

  return () => {
    active = false;
    unsubscribeNetwork();
    appStateSubscription.remove();
    subscription.unsubscribe();
  };
}
