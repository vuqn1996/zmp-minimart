import type { Branch } from "./api.js";
import { miniAppStorage } from "./storage.js";

export const BRANCH_STORAGE_KEY = "shop_selected_branch_v1";

function branchSessionStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function resolveSelectedBranch(branches: Branch[], storedId: string | null): Branch | undefined {
  return storedId ? branches.find((branch) => branch.id === storedId) : undefined;
}

export function rememberBranch(branch: Branch, customerId?: string): void {
  branchSessionStorage()?.setItem(BRANCH_STORAGE_KEY, branch.id);
  miniAppStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
  if (customerId) miniAppStorage.setItem(`${BRANCH_STORAGE_KEY}:${customerId}`, branch.id);
}

export function forgetBranch(): void {
  branchSessionStorage()?.removeItem(BRANCH_STORAGE_KEY);
  miniAppStorage.removeItem(BRANCH_STORAGE_KEY);
}

export function readRememberedBranch(customerId?: string): string | null {
  return (customerId ? miniAppStorage.getItem(`${BRANCH_STORAGE_KEY}:${customerId}`) : null)
    ?? branchSessionStorage()?.getItem(BRANCH_STORAGE_KEY)
    ?? miniAppStorage.getItem(BRANCH_STORAGE_KEY)
    ?? null;
}
