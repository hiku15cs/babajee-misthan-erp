import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import * as SQLite from "expo-sqlite";
import type { PostgrestError } from "@supabase/supabase-js";
import { Platform } from "react-native";

import { supabase } from "./supabase";

const DATABASE_NAME = "babajee-inventory.db";
const WEB_OUTBOX_KEY = "babajee.inventory.outbox.v1";

export type InventoryRpcName =
  | "record_material_procurement"
  | "receive_packaged_batch"
  | "mark_product_batch_return";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type OutboxRecord = {
  id: string;
  user_id: string;
  rpc_name: InventoryRpcName;
  payload: Record<string, JsonValue>;
  queued_at: string;
  last_error?: string | null;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS inventory_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          rpc_name TEXT NOT NULL,
          payload TEXT NOT NULL,
          queued_at TEXT NOT NULL,
          last_error TEXT
        );
      `);
      return database;
    })();
  }
  return databasePromise;
}

function readWebOutbox(): OutboxRecord[] {
  const saved = globalThis.localStorage.getItem(WEB_OUTBOX_KEY);
  if (!saved) return [];
  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed)) {
    throw new Error("Saved browser inventory queue has an invalid format.");
  }
  return parsed as OutboxRecord[];
}

function writeWebOutbox(operations: OutboxRecord[]): void {
  globalThis.localStorage.setItem(WEB_OUTBOX_KEY, JSON.stringify(operations));
}

async function readNativeOutbox(): Promise<OutboxRecord[]> {
  const database = await getDatabase();
  const operations = await database.getAllAsync<{
    id: string;
    user_id: string;
    rpc_name: string;
    payload: string;
    queued_at: string;
    last_error: string | null;
  }>(
    "SELECT id, user_id, rpc_name, payload, queued_at, last_error FROM inventory_outbox ORDER BY queued_at, id",
  );
  return operations.map((operation) => ({
    id: operation.id,
    user_id: operation.user_id,
    rpc_name: operation.rpc_name as InventoryRpcName,
    payload: JSON.parse(operation.payload) as Record<string, JsonValue>,
    queued_at: operation.queued_at,
    last_error: operation.last_error,
  }));
}

async function setNativeOperationError(id: string, message: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE inventory_outbox SET last_error = ? WHERE id = ?",
    message,
    id,
  );
}

async function deleteNativeOperation(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM inventory_outbox WHERE id = ?", id);
}

function isInventoryRpcName(value: string): value is InventoryRpcName {
  return (
    value === "record_material_procurement" ||
    value === "receive_packaged_batch" ||
    value === "mark_product_batch_return"
  );
}

export async function syncPendingInventoryOperations(): Promise<number> {
  const network = await Network.getNetworkStateAsync();
  if (network.isConnected !== true || network.isInternetReachable === false) {
    return 0;
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Could not read the signed-in user for inventory sync: ${sessionError.message}`);
  }
  const currentUserId = sessionData.session?.user.id;
  if (!currentUserId) return 0;

  const operations: OutboxRecord[] =
    Platform.OS === "web"
      ? readWebOutbox().filter((operation) => operation.user_id === currentUserId)
      : (await readNativeOutbox()).filter(
          (operation) => operation.user_id === currentUserId,
        );

  let synced = 0;
  for (const operation of operations) {
    if (!isInventoryRpcName(operation.rpc_name)) {
      throw new Error(`Unknown inventory sync operation: ${operation.rpc_name}`);
    }

    const { error } = await supabase.rpc(operation.rpc_name, operation.payload);
    if (error) {
      if (Platform.OS === "web") {
        writeWebOutbox(
          operations.map((queued) =>
            queued.id === operation.id
              ? { ...queued, last_error: formatSupabaseError(error) }
              : queued,
          ),
        );
      } else {
        await setNativeOperationError(
          operation.id,
          formatSupabaseError(error),
        );
      }
      throw new Error(
        `Inventory operation ${operation.id} is saved locally but failed to sync: ${formatSupabaseError(error)}`,
      );
    }

    if (Platform.OS === "web") {
      writeWebOutbox(readWebOutbox().filter((queued) => queued.id !== operation.id));
    } else {
      await deleteNativeOperation(operation.id);
    }
    synced += 1;
  }

  return synced;
}

function formatSupabaseError(error: PostgrestError): string {
  return `${error.message}${error.details ? ` (${error.details})` : ""}`;
}

export type QueueResult =
  | { status: "synced"; operationId: string }
  | { status: "queued"; operationId: string; syncError?: string };

export async function queueInventoryOperation(
  rpcName: InventoryRpcName,
  payload: Record<string, JsonValue>,
): Promise<QueueResult> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Could not verify the signed-in user: ${sessionError.message}`);
  }
  const userId = sessionData.session?.user.id;
  if (!userId) {
    throw new Error("Sign in before saving an inventory operation.");
  }

  const operationId = Crypto.randomUUID();
  const queuedAt = new Date().toISOString();
  const operationPayload = {
    ...payload,
    p_client_operation_id: operationId,
  };

  if (Platform.OS === "web") {
    writeWebOutbox([
      ...readWebOutbox(),
      {
        id: operationId,
        user_id: userId,
        rpc_name: rpcName,
        payload: operationPayload,
        queued_at: queuedAt,
      },
    ]);
  } else {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO inventory_outbox (id, user_id, rpc_name, payload, queued_at)
       VALUES (?, ?, ?, ?, ?)`,
      operationId,
      userId,
      rpcName,
      JSON.stringify(operationPayload),
      queuedAt,
    );
  }

  try {
    await syncPendingInventoryOperations();
  } catch (error) {
    return {
      status: "queued",
      operationId,
      syncError: error instanceof Error ? error.message : String(error),
    };
  }

  const stillQueued =
    Platform.OS === "web"
      ? readWebOutbox().some((operation) => operation.id === operationId)
      : await getDatabase().then((database) =>
          database.getFirstAsync<{ id: string }>(
            "SELECT id FROM inventory_outbox WHERE id = ?",
            operationId,
          ),
        );

  return stillQueued
    ? { status: "queued", operationId }
    : { status: "synced", operationId };
}

export async function getPendingInventoryCount(): Promise<number> {
  if (Platform.OS === "web") return readWebOutbox().length;
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM inventory_outbox",
  );
  return result?.count ?? 0;
}
