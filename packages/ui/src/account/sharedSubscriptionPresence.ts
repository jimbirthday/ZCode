import { useEffect, useSyncExternalStore } from "react";
import { useZCodeStore } from "@/store/StoreProvider.js";
import {
  accountPageFetch,
  hasCurrentSharedSubscription,
  loadSharedAccountBilling,
  readBrowserAccountSession,
  type AccountBillingView,
  type SharedEntitlement,
} from "./mgooleAccount.js";

export interface AccountFooterSnapshot {
  balance: number | null;
  frozenBalance: number;
  entitlements: SharedEntitlement[];
}

const EMPTY_SNAPSHOT: AccountFooterSnapshot = {
  balance: null,
  frozenBalance: 0,
  entitlements: [],
};

const PRESENCE_KEY = "zcode.mgooleAccount.hasSharedSubscription";

function readStoredPresence(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(PRESENCE_KEY) === "1";
  } catch {
    return false;
  }
}

let current = readStoredPresence();
let snapshot: AccountFooterSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let inflightSessionKey = "";
let requestId = 0;

function publish(value: boolean, nextSnapshot = snapshot): void {
  current = value;
  snapshot = nextSnapshot;
  if (typeof localStorage !== "undefined") {
    try {
      if (value) localStorage.setItem(PRESENCE_KEY, "1");
      else localStorage.removeItem(PRESENCE_KEY);
    } catch {
      // 只影响下次打开时的入口文案，存储失败不阻断订阅页。
    }
  }
  listeners.forEach((listener) => listener());
}

export function rememberSharedAccountBilling(view: AccountBillingView): void {
  const entitlements = view.entitlements.filter(
    (item) => item.status !== "revoked" && item.status !== "expired",
  );
  publish(hasCurrentSharedSubscription(view.entitlements), {
    balance: view.balance,
    frozenBalance: view.frozenBalance,
    entitlements,
  });
}

export function rememberSharedSubscriptionPresence(
  entitlements: ReadonlyArray<{ status: string }>,
): void {
  publish(hasCurrentSharedSubscription(entitlements));
}

export function subscribeSharedSubscriptionPresence(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readSharedSubscriptionPresence(): boolean {
  return current;
}

export function readAccountFooterSnapshot(): AccountFooterSnapshot {
  return snapshot;
}

export function refreshSharedSubscriptionPresence(): Promise<void> {
  const session = readBrowserAccountSession();
  const key = session?.accessToken ?? "";
  if (inflight && inflightSessionKey === key) return inflight;
  inflightSessionKey = key;
  const id = ++requestId;
  inflight = (async () => {
    if (!session) {
      publish(false, EMPTY_SNAPSHOT);
      return;
    }
    try {
      const view = await loadSharedAccountBilling({ fetchImpl: accountPageFetch, session });
      if (id !== requestId) return;
      rememberSharedAccountBilling(view);
    } catch {
      // 刷新失败时保留上次结果，避免已订阅用户被短暂改回「升级」。
    }
  })().finally(() => {
    if (inflightSessionKey === key) inflight = null;
  });
  return inflight;
}

export function useAccountFooterSnapshot(): AccountFooterSnapshot {
  const userId = useZCodeStore((state) => state.user?.id ?? null);
  const value = useSyncExternalStore(
    subscribeSharedSubscriptionPresence,
    readAccountFooterSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  useEffect(() => {
    void refreshSharedSubscriptionPresence();
  }, [userId]);
  return value;
}

export function useSharedSubscriptionPresence(): boolean {
  const userId = useZCodeStore((state) => state.user?.id ?? null);
  const presence = useSyncExternalStore(
    subscribeSharedSubscriptionPresence,
    readSharedSubscriptionPresence,
    () => false,
  );
  useEffect(() => {
    const refresh = () => {
      void refreshSharedSubscriptionPresence();
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [userId]);
  return presence;
}
