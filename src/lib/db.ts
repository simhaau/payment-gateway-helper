import { Customer, Group, BillingBatch, Settings, DEFAULT_SETTINGS } from './types';

const DB_NAME = 'masav_collection_system';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('customers')) {
        const cs = db.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
        cs.createIndex('fullName', 'fullName');
        cs.createIndex('idNumber', 'idNumber');
        cs.createIndex('phone', 'phone');
        cs.createIndex('groupId', 'groupId');
        cs.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('batches')) {
        const bs = db.createObjectStore('batches', { keyPath: 'id', autoIncrement: true });
        bs.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };
  });
}

function txStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// CUSTOMERS
export async function getAllCustomers(): Promise<Customer[]> {
  const store = await txStore('customers', 'readonly');
  return reqToPromise(store.getAll());
}

export async function getCustomer(id: number): Promise<Customer | undefined> {
  const store = await txStore('customers', 'readonly');
  return reqToPromise(store.get(id));
}

export async function addCustomer(c: Omit<Customer, 'id'>): Promise<number> {
  const store = await txStore('customers', 'readwrite');
  return reqToPromise(store.add(c)) as Promise<number>;
}

export async function updateCustomer(c: Customer): Promise<void> {
  const store = await txStore('customers', 'readwrite');
  await reqToPromise(store.put(c));
}

export async function deleteCustomer(id: number): Promise<void> {
  const store = await txStore('customers', 'readwrite');
  await reqToPromise(store.delete(id));
}

export async function bulkUpdateCustomers(customers: Customer[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('customers', 'readwrite');
  const store = tx.objectStore('customers');
  for (const c of customers) store.put(c);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// GROUPS
export async function getAllGroups(): Promise<Group[]> {
  const store = await txStore('groups', 'readonly');
  return reqToPromise(store.getAll());
}

export async function addGroup(g: Omit<Group, 'id'>): Promise<number> {
  const store = await txStore('groups', 'readwrite');
  return reqToPromise(store.add(g)) as Promise<number>;
}

export async function updateGroup(g: Group): Promise<void> {
  const store = await txStore('groups', 'readwrite');
  await reqToPromise(store.put(g));
}

export async function deleteGroup(id: number): Promise<void> {
  const store = await txStore('groups', 'readwrite');
  await reqToPromise(store.delete(id));
}

// BATCHES
export async function getAllBatches(): Promise<BillingBatch[]> {
  const store = await txStore('batches', 'readonly');
  return reqToPromise(store.getAll());
}

export async function addBatch(b: Omit<BillingBatch, 'id'>): Promise<number> {
  const store = await txStore('batches', 'readwrite');
  return reqToPromise(store.add(b)) as Promise<number>;
}

export async function updateBatch(b: BillingBatch): Promise<void> {
  const store = await txStore('batches', 'readwrite');
  await reqToPromise(store.put(b));
}

export async function deleteBatch(id: number): Promise<void> {
  const store = await txStore('batches', 'readwrite');
  await reqToPromise(store.delete(id));
}

// SETTINGS
export async function getSettings(): Promise<Settings> {
  const store = await txStore('settings', 'readonly');
  const s = await reqToPromise(store.get(1));
  return s || DEFAULT_SETTINGS;
}

export async function saveSettings(s: Settings): Promise<void> {
  const store = await txStore('settings', 'readwrite');
  await reqToPromise(store.put({ ...s, id: 1 }));
}

// EXPORT DATA
export async function exportAllData(): Promise<string> {
  const [customers, groups, batches, settings] = await Promise.all([
    getAllCustomers(), getAllGroups(), getAllBatches(), getSettings()
  ]);
  return JSON.stringify({ customers, groups, batches, settings }, null, 2);
}
