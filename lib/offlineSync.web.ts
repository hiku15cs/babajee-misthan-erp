import type { OfflineSale, QueuedSaleResult, SyncResult } from "./offlineSync";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "./supabase";
import { syncPendingInventoryOperations } from "./inventoryOutbox";

export async function queueOfflineTransaction(
  _sale: OfflineSale,
): Promise<QueuedSaleResult> {
  throw new Error(
    "Offline transaction storage is available in the Android app; browser sales storage is not configured.",
  );
}

export async function syncPendingTransactions(): Promise<SyncResult> {
  return { synced: 0, pending: 0, failures: [] };
}

export function startOfflineSyncManager(): () => void {
  let active = true;
  let syncing = false;
  const syncInventory = async () => {
    if (!active || syncing) return;
    syncing = true;
    try {
      await syncPendingInventoryOperations();
    } catch (error) {
      console.error("Could not sync offline inventory operations", error);
    } finally {
      syncing = false;
    }
  };
  const unsubscribeNetwork = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void syncInventory();
  });
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session) setTimeout(() => void syncInventory(), 0);
  });
  void NetInfo.fetch().then((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void syncInventory();
  }).catch((error: unknown) => {
    console.error("Could not check network status for offline sync", error);
  });
  return () => {
    active = false;
    unsubscribeNetwork();
    subscription.unsubscribe();
  };
}
