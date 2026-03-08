import { Customer, Group, BillingBatch, Settings, DebtRecord, DEFAULT_SETTINGS } from './types';

const DB_NAME = 'masav_collection_system';
const DB_VERSION = 2;
const BACKUP_KEY = 'masav_backup';

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
      if (!db.objectStoreNames.contains('debts')) {
        const ds = db.createObjectStore('debts', { keyPath: 'id', autoIncrement: true });
        ds.createIndex('customerId', 'customerId');
        ds.createIndex('month', 'month');
        ds.createIndex('status', 'status');
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

let backupTimeout: ReturnType<typeof setTimeout> | null = null;
function scheduleBackup() {
  if (backupTimeout) clearTimeout(backupTimeout);
  backupTimeout = setTimeout(async () => {
    try {
      const [customers, groups, batches, settings, debts] = await Promise.all([
        getAllCustomers(), getAllGroups(), getAllBatches(), getSettings(), getAllDebts()
      ]);
      const backup = JSON.stringify({ customers, groups, batches, settings, debts, backupDate: new Date().toISOString() });
      localStorage.setItem(BACKUP_KEY, backup);
    } catch (e) {
      console.warn('Auto-backup failed:', e);
    }
  }, 500);
}

export async function restoreFromBackupIfNeeded(): Promise<boolean> {
  try {
    const customers = await getAllCustomers();
    if (customers.length > 0) return false;
    const backupStr = localStorage.getItem(BACKUP_KEY);
    if (!backupStr) return false;
    const backup = JSON.parse(backupStr);
    if (!backup.customers?.length && !backup.groups?.length) return false;
    
    const db = await openDB();
    for (const storeName of ['groups', 'customers', 'batches', 'debts']) {
      const data = backup[storeName === 'batches' ? 'batches' : storeName];
      if (data?.length) {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of data) store.put(item);
        await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
      }
    }
    if (backup.settings) await saveSettings(backup.settings);
    console.log('Data restored from backup:', backup.backupDate);
    return true;
  } catch (e) {
    console.warn('Restore from backup failed:', e);
    return false;
  }
}

export async function importData(jsonString: string): Promise<void> {
  const data = JSON.parse(jsonString);
  const db = await openDB();
  for (const storeName of ['groups', 'customers', 'batches', 'debts']) {
    const items = data[storeName];
    if (items?.length) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const item of items) store.put(item);
      await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    }
  }
  if (data.settings) await saveSettings(data.settings);
  scheduleBackup();
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
  const id = (await reqToPromise(store.add(c))) as number;
  scheduleBackup();
  return id;
}
export async function updateCustomer(c: Customer): Promise<void> {
  const store = await txStore('customers', 'readwrite');
  await reqToPromise(store.put(c));
  scheduleBackup();
}
export async function deleteCustomer(id: number): Promise<void> {
  const store = await txStore('customers', 'readwrite');
  await reqToPromise(store.delete(id));
  scheduleBackup();
}
export async function bulkUpdateCustomers(customers: Customer[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('customers', 'readwrite');
  const store = tx.objectStore('customers');
  for (const c of customers) store.put(c);
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  scheduleBackup();
}

// GROUPS
export async function getAllGroups(): Promise<Group[]> {
  const store = await txStore('groups', 'readonly');
  return reqToPromise(store.getAll());
}
export async function addGroup(g: Omit<Group, 'id'>): Promise<number> {
  const store = await txStore('groups', 'readwrite');
  const id = (await reqToPromise(store.add(g))) as number;
  scheduleBackup();
  return id;
}
export async function updateGroup(g: Group): Promise<void> {
  const store = await txStore('groups', 'readwrite');
  await reqToPromise(store.put(g));
  scheduleBackup();
}
export async function deleteGroup(id: number): Promise<void> {
  const store = await txStore('groups', 'readwrite');
  await reqToPromise(store.delete(id));
  scheduleBackup();
}

// BATCHES
export async function getAllBatches(): Promise<BillingBatch[]> {
  const store = await txStore('batches', 'readonly');
  return reqToPromise(store.getAll());
}
export async function addBatch(b: Omit<BillingBatch, 'id'>): Promise<number> {
  const store = await txStore('batches', 'readwrite');
  const id = (await reqToPromise(store.add(b))) as number;
  scheduleBackup();
  return id;
}
export async function updateBatch(b: BillingBatch): Promise<void> {
  const store = await txStore('batches', 'readwrite');
  await reqToPromise(store.put(b));
  scheduleBackup();
}
export async function deleteBatch(id: number): Promise<void> {
  const store = await txStore('batches', 'readwrite');
  await reqToPromise(store.delete(id));
  scheduleBackup();
}

// DEBTS
export async function getAllDebts(): Promise<DebtRecord[]> {
  const store = await txStore('debts', 'readonly');
  return reqToPromise(store.getAll());
}
export async function getDebtsByCustomer(customerId: number): Promise<DebtRecord[]> {
  const store = await txStore('debts', 'readonly');
  const index = store.index('customerId');
  return reqToPromise(index.getAll(customerId));
}
export async function addDebt(d: Omit<DebtRecord, 'id'>): Promise<number> {
  const store = await txStore('debts', 'readwrite');
  const id = (await reqToPromise(store.add(d))) as number;
  scheduleBackup();
  return id;
}
export async function updateDebt(d: DebtRecord): Promise<void> {
  const store = await txStore('debts', 'readwrite');
  await reqToPromise(store.put(d));
  scheduleBackup();
}
export async function deleteDebt(id: number): Promise<void> {
  const store = await txStore('debts', 'readwrite');
  await reqToPromise(store.delete(id));
  scheduleBackup();
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
  scheduleBackup();
}

// EXPORT DATA
export async function exportAllData(): Promise<string> {
  const [customers, groups, batches, settings, debts] = await Promise.all([
    getAllCustomers(), getAllGroups(), getAllBatches(), getSettings(), getAllDebts()
  ]);
  return JSON.stringify({ customers, groups, batches, settings, debts }, null, 2);
}
