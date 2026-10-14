import { nativeStorage } from "zmp-sdk-modern/apis";

function developmentStorage(): Storage | undefined {
  return import.meta.env.DEV && typeof window !== "undefined" ? window.localStorage : undefined;
}

export const miniAppStorage = {
  getItem(key: string): string | null {
    try {
      return nativeStorage.getItem(key) || null;
    } catch {
      return developmentStorage()?.getItem(key) ?? null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      nativeStorage.setItem(key, value);
    } catch {
      developmentStorage()?.setItem(key, value);
    }
  },
  removeItem(key: string): void {
    try {
      nativeStorage.removeItem(key);
    } catch {
      developmentStorage()?.removeItem(key);
    }
  },
};
