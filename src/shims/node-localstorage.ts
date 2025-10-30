/**
 * Browser-safe stub for `node-localstorage`.
 *
 * The Lit SDK dynamically imports `node-localstorage` in environments where
 * `process.versions.node` is defined. When bundling for the browser with Vite,
 * we alias that module to this shim so that Rollup does not try to include the
 * Node-specific implementation (and its transitive fs/path dependencies).
 */
class LocalStorageStub {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_location?: string, _quota?: number) {}

  get length(): number {
    return 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  key(_index: number): string | null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getItem(_key: string): string | null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setItem(_key: string, _value: string): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeItem(_key: string): void {}

  clear(): void {}

  /** Mirrors the API used internally for bookkeeping, but no-ops in the shim. */
  destroy(): void {}
}

class JSONStorageStub extends LocalStorageStub {}

class QuotaExceededError extends Error {
  constructor(message = "LocalStorage quota exceeded.") {
    super(message);
    this.name = "QUOTA_EXCEEDED_ERR";
  }
}

export const LocalStorage = LocalStorageStub;
export const JSONStorage = JSONStorageStub;
export const QUOTA_EXCEEDED_ERR = QuotaExceededError;

export default {
  LocalStorage,
  JSONStorage,
  QUOTA_EXCEEDED_ERR,
};
