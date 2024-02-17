export interface KeyValueStorage {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  listKeys(): Promise<string[]>
}
