import api from "./api";
import { getPendingSales, removePendingSale } from "./offlineDb";

let isSyncing = false;

export async function syncPendingSales(onProgress) {
  if (isSyncing) return { synced: 0, failed: 0 };
  isSyncing = true;

  const pending = await getPendingSales();
  let synced = 0;
  let failed = 0;

  for (const sale of pending) {
    try {
      const { localId, createdAt, ...saleData } = sale;
      await api.post("/pos/sell", saleData);
      await removePendingSale(localId);
      synced++;
      if (onProgress) onProgress({ synced, failed, total: pending.length });
    } catch (e) {
      console.error("Sync failed for sale:", sale.localId, e);
      failed++;
    }
  }

  isSyncing = false;
  return { synced, failed, total: pending.length };
}

export function setupAutoSync(intervalMs = 30000) {
  const checkAndSync = async () => {
    if (!navigator.onLine) return;
    const pending = await getPendingSales();
    if (pending.length > 0) {
      console.log(`Auto-syncing ${pending.length} pending sales...`);
      const result = await syncPendingSales();
      if (result.synced > 0) {
        console.log(`Synced ${result.synced} sales`);
      }
    }
  };

  const interval = setInterval(checkAndSync, intervalMs);
  window.addEventListener("online", () => {
    setTimeout(checkAndSync, 2000);
  });

  return () => clearInterval(interval);
}
