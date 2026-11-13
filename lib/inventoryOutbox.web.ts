import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "./supabase";

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
  last_error?: string;
};

function readOutbox(): OutboxRecord[] {
  const saved = globalThis.localStorage.getItem(WEB_OUTBOX_KEY);
  if (!saved) return [];
  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed)) {
    throw new Error("Saved browser inventory queue has an invalid format.");
  }
  return parsed as OutboxRecord[];
}

function writeOutbox(operations: OutboxRecord[]): void {
  globalThis.localStorage.setItem(WEB_OUTBOX_KEY, JSON.stringify(operations));
}

function isInventoryRpcName(value: string): value is InventoryRpcName {
  return (
    value === "record_material_procurement" ||
    value === "receive_packaged_batch" ||
    value === "mark_product_batch_return"
  );
}

function formatSupabaseError(error: PostgrestError): string {
  return `${error.message}${error.details ? ` (${error.details})` : ""}`;
}

export async function syncPendingInventoryOperations(): Promise<number> {
  const network = await Network.getNetworkStateAsync();
  if (network.isConnected !== true || network.isInternetReachable === false) {
    return 0;
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(
      `Could not read the signed-in user for inventory sync: ${sessionError.message}`,
    );
  }
  const userId = sessionData.session?.user.id;
  if (!userId) return 0;

  const operations = readOutbox().filter(
    (operation) => operation.user_id === userId,
  );
  let synced = 0;

  for (const operation of operations) {
    if (!isInventoryRpcName(operation.rpc_name)) {
      throw new Error(`Unknown inventory sync operation: ${operation.rpc_name}`);
    }

    const { error } = await supabase.rpc(operation.rpc_name, operation.payload);
    if (error) {
      writeOutbox(
        readOutbox().map((queued) =>
          queued.id === operation.id
            ? { ...queued, last_error: formatSupabaseError(error) }
            : queued,
        ),
      );
      throw new Error(
        `Inventory operation ${operation.id} is saved locally but failed to sync: ${formatSupabaseError(error)}`,
      );
    }

    writeOutbox(
      readOutbox().filter((queued) => queued.id !== operation.id),
    );
    synced += 1;
  }
  return synced;
}

export type QueueResult =
  | { status: "synced"; operationId: string }
  | { status: "queued"; operationId: string; syncError?: string };

export async function queueInventoryOperation(
  rpcName: InventoryRpcName,
  payload: Record<string, JsonValue>,
): Promise<QueueResult> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not verify the signed-in user: ${error.message}`);
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Sign in before saving an inventory operation.");

  const operationId = Crypto.randomUUID();
  writeOutbox([
    ...readOutbox(),
    {
      id: operationId,
      user_id: userId,
      rpc_name: rpcName,
      payload: {
        ...payload,
        p_client_operation_id: operationId,
      },
      queued_at: new Date().toISOString(),
    },
  ]);

  try {
    await syncPendingInventoryOperations();
  } catch (syncError) {
    return {
      status: "queued",
      operationId,
      syncError: syncError instanceof Error ? syncError.message : String(syncError),
    };
  }

  return readOutbox().some((operation) => operation.id === operationId)
    ? { status: "queued", operationId }
    : { status: "synced", operationId };
}

export async function getPendingInventoryCount(): Promise<number> {
  return readOutbox().length;
}
