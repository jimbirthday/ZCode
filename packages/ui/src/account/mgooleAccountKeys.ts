import {
  asNumber,
  asRecord,
  asString,
  getJson,
  MGOOLE_ACCOUNT_API_BASE,
  type AccountApiKey,
  type AccountSession,
  type FetchLike,
  type MgooleModelCredential,
  type MgooleProviderWriter,
} from "./mgooleAccount.js";

export function isUsableAccountApiKey(key: AccountApiKey, now = Date.now()): boolean {
  if (!key.key.trim()) return false;
  if (key.status !== "active") return false;
  if (!key.expiresAt) return true;
  const expires = Date.parse(key.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

function normalizeApiKey(value: unknown): AccountApiKey | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asNumber(record.id);
  if (id === null) return null;
  return {
    id,
    key: asString(record.key),
    name: asString(record.name),
    status: asString(record.status),
    expiresAt: typeof record.expires_at === "string" ? record.expires_at : null,
    updatedAt: asString(record.updated_at),
  };
}

export function selectMgooleModelCredential(input: {
  keys: readonly AccountApiKey[];
  previousKeyId?: string | null;
  now?: number;
}): MgooleModelCredential | null {
  const now = input.now ?? Date.now();
  const usable = input.keys.filter((key) => isUsableAccountApiKey(key, now));
  if (usable.length === 0) return null;
  const previousId = input.previousKeyId?.trim();
  const previous = previousId
    ? usable.find((key) => String(key.id) === previousId)
    : undefined;
  const chosen =
    previous ??
    [...usable].sort((left, right) => {
      const time = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (Number.isFinite(time) && time !== 0) return time;
      return right.id - left.id;
    })[0];
  if (!chosen) return null;
  return {
    templateId: "mgoole",
    access: { type: "api-key", apiKey: chosen.key },
    syncedKeyId: String(chosen.id),
    keyName: chosen.name,
  };
}

function keysFromPayload(payload: unknown): AccountApiKey[] {
  const record = asRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.items)
      ? record.items
      : [];
  return items.flatMap((item) => {
    const key = normalizeApiKey(item);
    return key ? [key] : [];
  });
}

export async function syncMgooleModelCredential(input: {
  fetchImpl: FetchLike;
  session: AccountSession;
  previousKeyId?: string | null;
  now?: number;
  baseUrl?: string;
}): Promise<MgooleModelCredential | null> {
  const baseUrl = (input.baseUrl ?? MGOOLE_ACCOUNT_API_BASE).replace(/\/+$/, "");
  const keys: AccountApiKey[] = [];
  let page = 1;
  let pages = 1;
  do {
    const payload = await getJson(
      input.fetchImpl,
      `${baseUrl}/keys?page=${page}&page_size=100`,
      input.session,
    );
    keys.push(...keysFromPayload(payload));
    const record = asRecord(payload);
    pages = asNumber(record?.pages) ?? 1;
    page += 1;
  } while (page <= pages);
  return selectMgooleModelCredential({
    keys,
    previousKeyId: input.previousKeyId,
    now: input.now,
  });
}

export async function persistSyncedMgooleCredential(
  writer: MgooleProviderWriter,
  credential: MgooleModelCredential | null,
): Promise<{ providerId: string; apiKey: string } | null> {
  const view = await writer.getView();
  const existing = view.providers.find((provider) => provider.templateId === "mgoole");
  if (!credential) {
    if (existing) await writer.saveApiKey(existing.providerId, "");
    return null;
  }
  if (existing) {
    await writer.saveApiKey(existing.providerId, credential.access.apiKey);
    return { providerId: existing.providerId, apiKey: credential.access.apiKey };
  }
  const created = await writer.createMgooleProvider(credential.access.apiKey);
  return { providerId: created.providerId, apiKey: credential.access.apiKey };
}

