import path from "path";
import { KeyValueStorage } from "./KeyValueStorage.js";
import * as fs from 'fs/promises'

// key-value storage using a file to store the data on disk
export class FileKVStorage implements KeyValueStorage {
  constructor(private readonly path: string) {
  }

  async get(key: string): Promise<string | undefined> {
    try {
      const data = await fs.readFile(this.path, 'utf-8');
      const data_1 = JSON.parse(data);
      return data_1[key];
    } catch (e) {
      if ((e as any).code === 'ENOENT') {
        return undefined;
      }
      throw e;
    }
  }

  async set(key: string, value: string): Promise<void> {
    return fs.readFile(this.path, 'utf-8')
      .then(data => JSON.parse(data))
      .catch(e => {
        if (e.code === 'ENOENT') {
          return {}
        }
        throw e
      })
      .then(data => {
        data[key] = value
        return data
      })
      .then(data => JSON.stringify(data))
      .then(data => fs.writeFile(this.path, data))
  }

  async delete(key: string): Promise<void> {
    return fs.readFile(this.path, 'utf-8')
      .then(data => JSON.parse(data))
      .catch(e => {
        if (e.code === 'ENOENT') {
          return {}
        }
        throw e
      })
      .then(data => {
        delete data[key]
        return data
      })
      .then(data => JSON.stringify(data))
      .then(data => fs.writeFile(this.path, data))
  }

  async listKeys(): Promise<string[]> {
    const data = await fs.readFile(this.path, 'utf-8');
    const data_1 = JSON.parse(data);
    return Object.keys(data_1);
  }


  async init() {
    const parentDir = path.dirname(this.path);
    try {
      await fs.access(parentDir);
    } catch (e) {
      if ((e as any).code === 'ENOENT') {
        await fs.mkdir(parentDir, { recursive: true });
      }
    }

    try {
      await fs.access(this.path);
    } catch (e) {
      if ((e as any).code === 'ENOENT') {
        await fs.writeFile(this.path, '{}');
      }
    }

  }
}
