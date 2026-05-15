import React, { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { getPendingSales } from "../lib/offlineDb";
import { syncPendingSales } from "../lib/syncQueue";
import { toast } from "sonner";

export default function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const check = async () => {
      const pending = await getPendingSales();
      setPendingCount(pending.length);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncPendingSales();
      if (result.synced > 0) {
        toast.success(`${result.synced} ventas sincronizadas`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} ventas fallaron al sincronizar`);
      }
      const pending = await getPendingSales();
      setPendingCount(pending.length);
    } catch {
      toast.error("Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      data-testid="connection-status"
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 text-xs font-semibold shadow-lg ${
        isOnline ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-red-50 text-red-800 border border-red-200"
      }`}
    >
      {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      <span>{isOnline ? "En línea" : "Sin conexión"}</span>
      {pendingCount > 0 && (
        <>
          <span className="mx-1">|</span>
          <span>{pendingCount} ventas pendientes</span>
          {isOnline && (
            <button
              data-testid="sync-btn"
              onClick={handleSync}
              disabled={syncing}
              className="ml-1 p-1 hover:bg-amber-100 rounded"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
