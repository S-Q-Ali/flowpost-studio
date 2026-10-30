// Simple IndexedDB wrapper for offline queue persistence

const DB_NAME = "flowpost-offline";
const DB_VERSION = 1;

interface PostQueueItem {
  id: string;
  platform: string;
  caption?: string;
  scheduledAt: string;
  createdAt: number;
}

class OfflineDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("pending-posts")) {
          db.createObjectStore("pending-posts", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("post-queue")) {
          db.createObjectStore("post-queue", { keyPath: "id" });
        }
      };
    });
  }

  async addPost(post: PostQueueItem): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("pending-posts", "readwrite");
      const store = tx.objectStore("pending-posts");
      const request = store.put(post);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingPosts(): Promise<PostQueueItem[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("pending-posts", "readonly");
      const store = tx.objectStore("pending-posts");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removePost(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("pending-posts", "readwrite");
      const store = tx.objectStore("pending-posts");
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearPending(): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("pending-posts", "readwrite");
      const store = tx.objectStore("pending-posts");
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineDB = new OfflineDB();
