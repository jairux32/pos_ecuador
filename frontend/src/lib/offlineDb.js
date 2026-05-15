const DB_NAME = "pos-ecuador-offline";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("products")) {
        db.createObjectStore("products", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pendingSales")) {
        db.createObjectStore("pendingSales", { keyPath: "localId", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("syncMeta")) {
        db.createObjectStore("syncMeta", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheProducts(products) {
  const db = await openDB();
  const store = tx(db, "products", "readwrite");
  await reqToPromise(store.clear());
  for (const p of products) {
    store.put(p);
  }
  const meta = tx(db, "syncMeta", "readwrite");
  meta.put({ key: "lastProductSync", timestamp: new Date().toISOString() });
}

export async function getCachedProducts(search = "") {
  const db = await openDB();
  const store = tx(db, "products", "readonly");
  const all = await reqToPromise(store.getAll());
  if (!search) return all;
  const q = search.toLowerCase();
  return all.filter(
    (p) =>
      p.nombre?.toLowerCase().includes(q) ||
      p.codigo_interno?.toLowerCase().includes(q) ||
      p.codigo_barras?.includes(q)
  );
}

export async function savePendingSale(saleData) {
  const db = await openDB();
  const store = tx(db, "pendingSales", "readwrite");
  const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await reqToPromise(store.put({ ...saleData, localId, createdAt: new Date().toISOString() }));
  return localId;
}

export async function getPendingSales() {
  const db = await openDB();
  const store = tx(db, "pendingSales", "readonly");
  return await reqToPromise(store.getAll());
}

export async function removePendingSale(localId) {
  const db = await openDB();
  const store = tx(db, "pendingSales", "readwrite");
  await reqToPromise(store.delete(localId));
}

export async function getLastSyncTime() {
  try {
    const db = await openDB();
    const store = tx(db, "syncMeta", "readonly");
    const meta = await reqToPromise(store.get("lastProductSync"));
    return meta?.timestamp || null;
  } catch {
    return null;
  }
}
