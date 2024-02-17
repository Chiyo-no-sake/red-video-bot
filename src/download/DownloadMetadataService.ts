import { Mutex } from 'async-mutex';
import { KeyValueStorage } from "../storage/KeyValueStorage.js";
import { UIProgressInfo, UIVideoInfo } from "../template/Engine.js";
import { BigInteger } from 'big-integer'
import bigInt from "big-integer";

export type DownloadJob = {
  // chatId is for sending messages (bot auth)
  chatId: number | string,
  id: string
  ctxInfo: {
    // chatName is for downloading files (user auth)
    chatName: string
    msgDateSeconds: number
    fileSize: number
    extension: string
  }
  offset: BigInteger
  videoInfo: UIVideoInfo
  filePath?: string
  queuePosition?: number
  progressInfo?: UIProgressInfo
  stopped?: boolean
  onStart?: (id: string) => void
}

export class DownloadMetadataService {
  private storage: KeyValueStorage;
  private mutex: Mutex;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
    this.mutex = new Mutex();
  }

  async saveDownloadStatus(downloadId: string, job: DownloadJob): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.storage.set(downloadId, JSON.stringify(job));
    } finally {
      release();
    }
  }

  async getDownloadStatus(downloadId: string): Promise<DownloadJob | undefined> {
    const release = await this.mutex.acquire();
    try {
      const statusString = await this.storage.get(downloadId);
      if (statusString) {
        const job = JSON.parse(statusString) as DownloadJob;
        job.offset = bigInt(job.offset);
        return job;
      }
      return undefined;
    } finally {
      release();
    }
  }

  async deleteDownloadStatus(downloadId: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.storage.delete(downloadId);
    } finally {
      release();
    }
  }

  async listDownloadKeys(): Promise<string[]> {
    const release = await this.mutex.acquire();
    try {
      return this.storage.listKeys();
    } finally {
      release();
    }
  }
}
