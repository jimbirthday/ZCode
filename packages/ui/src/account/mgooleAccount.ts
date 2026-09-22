/**
 * sub2api account client for 芒果AI.
 * Login, key sync, and billing decisions live here so the UI only renders them.
 */

export const MGOOLE_ACCOUNT_API_BASE = "https://mgoole.com/api/v1";
export const MGOOLE_ACCOUNT_SESSION_KEY = "zcode.mgooleAccount.session";
export const MGOOLE_SYNCED_KEY_ID_KEY = "zcode.mgooleAccount.syncedKeyId";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CaptchaProof {
  turnstileToken?: string;
  tencentCaptchaTicket?: string;
  tencentCaptchaRandstr?: string;
}

export interface AccountSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number | null;
  userId: number | null;
  email: string;
  authorization: string;
}

export type LoginResult =
  | { kind: "session"; session: AccountSession }
  | { kind: "needs_2fa"; tempToken: string; emailMasked: string }
  | { kind: "rejected"; message: string };

export interface AccountApiKey {
  id: number;
  key: string;
  name: string;
  status: string;
  expiresAt: string | null;
  updatedAt: string;
}

export interface MgooleModelCredential {
  templateId: "mgoole";
  access: { type: "api-key"; apiKey: string };
  syncedKeyId: string;
  keyName: string;
}

export interface SharedEntitlement {
  id: number;
  planId: number;
  name: string;
  price: number;
  validityDays: number;
  status: string;
  expiresAt: string;
}

export interface SharedPlanOffer {
  id: number;
  name: string;
  price: number;
  validityDays: number;
  forSale: boolean;
}

export interface AccountBillingView {
  balance: number;
  frozenBalance: number;
  entitlements: SharedEntitlement[];
  plans: SharedPlanOffer[];
}

export interface PaymentOrderStart {
  orderId: number;
  orderType: "balance" | "shared_subscription";
  outTradeNo: string;
  payUrl: string;
  qrCode: string;
  status: string;
}

export interface PublicLoginSettings {
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  tencentCaptchaEnabled: boolean;
  tencentCaptchaAppId: string;
  aliyunCaptchaEnabled: boolean;
}

export interface PaymentMethodOption {
  id: string;
  label: string;
}

export interface MgooleProviderWriter {
  getView(): Promise<{
    providers: ReadonlyArray<{ providerId: string; templateId?: string | null }>;
  }>;
  saveApiKey(providerId: string, apiKey: string): Promise<void>;
  createMgooleProvider(apiKey: string): Promise<{ providerId: string }>;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rejected(message: string): LoginResult {
  return { kind: "rejected", message: message || "login rejected" };
}

export function sessionFromLoginResult(result: LoginResult): AccountSession | null {
  return result.kind === "session" ? result.session : null;
}

function sessionFromAuthData(data: Record<string, unknown>): AccountSession | null {
  const accessToken = asString(data.access_token).trim();
  if (!accessToken) return null;
  const tokenType = asString(data.token_type).trim() || "Bearer";
  const user = asRecord(data.user);
  return {
    accessToken,
    refreshToken: asString(data.refresh_token),
    tokenType,
    expiresIn: asNumber(data.expires_in),
    userId: user ? asNumber(user.id) : null,
    email: user ? asString(user.email) : "",
    authorization: `${tokenType} ${accessToken}`,
  };
}

export function interpretLoginPayload(body: unknown): LoginResult {
  const record = asRecord(body);
  if (!record) return rejected("empty login response");
  if (typeof record.code === "number" && record.code !== 0) {
    return rejected(asString(record.message) || "login rejected");
  }
  const data = asRecord(record.data) ?? record;
  if (data.requires_2fa === true) {
    const tempToken = asString(data.temp_token).trim();
    if (!tempToken) return rejected("missing 2FA session");
    return {
      kind: "needs_2fa",
      tempToken,
      emailMasked: asString(data.user_email_masked),
    };
  }
  const session = sessionFromAuthData(data);
  if (!session) return rejected(asString(record.message) || "login did not return a session");
  return { kind: "session", session };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { code: response.status, message: text };
  }
}

export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  session?: AccountSession,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(session ? { authorization: session.authorization } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

export async function getJson(
  fetchImpl: FetchLike,
  url: string,
  session: AccountSession,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: session.authorization,
    },
  });
  const body = await readJson(response);
  if (!response.ok) {
    const record = asRecord(body);
    throw new Error(record ? asString(record.message) || response.statusText : response.statusText);
  }
  return unwrapData(body);
}

export function unwrapData(body: unknown): unknown {
  const record = asRecord(body);
  if (record && typeof record.code === "number") {
    if (record.code !== 0) {
      throw new Error(asString(record.message) || "request failed");
    }
    return record.data;
  }
  return body;
}

function loginBody(email: string, password: string, captcha?: CaptchaProof): Record<string, string> {
  const body: Record<string, string> = { email: email.trim(), password };
  const turnstile = captcha?.turnstileToken?.trim();
  const ticket = captcha?.tencentCaptchaTicket?.trim();
  const randstr = captcha?.tencentCaptchaRandstr?.trim();
  if (turnstile) body.turnstile_token = turnstile;
  if (ticket) body.tencent_captcha_ticket = ticket;
  if (randstr) body.tencent_captcha_randstr = randstr;
  return body;
}

export async function loginMgooleAccount(input: {
  fetchImpl: FetchLike;
  email: string;
  password: string;
  captcha?: CaptchaProof;
  baseUrl?: string;
}): Promise<LoginResult> {
  const baseUrl = (input.baseUrl ?? MGOOLE_ACCOUNT_API_BASE).replace(/\/+$/, "");
  let response: Response;
  let body: unknown;
  try {
    ({ response, body } = await postJson(
      input.fetchImpl,
      `${baseUrl}/auth/login`,
      loginBody(input.email, input.password, input.captcha),
    ));
  } catch (error) {
    return rejected(error instanceof Error ? error.message : "login failed");
  }
  if (!response.ok) {
    const record = asRecord(body);
    return rejected(record ? asString(record.message) || "login rejected" : "login rejected");
  }
  return interpretLoginPayload(body);
}

export async function completeMgooleLogin2FA(input: {
  fetchImpl: FetchLike;
  tempToken: string;
  totpCode: string;
  baseUrl?: string;
}): Promise<LoginResult> {
  const baseUrl = (input.baseUrl ?? MGOOLE_ACCOUNT_API_BASE).replace(/\/+$/, "");
  let response: Response;
  let body: unknown;
  try {
    ({ response, body } = await postJson(input.fetchImpl, `${baseUrl}/auth/login/2fa`, {
      temp_token: input.tempToken,
      totp_code: input.totpCode,
    }));
  } catch (error) {
    return rejected(error instanceof Error ? error.message : "2FA failed");
  }
  if (!response.ok) {
    const record = asRecord(body);
    return rejected(record ? asString(record.message) || "2FA rejected" : "2FA rejected");
  }
  const result = interpretLoginPayload(body);
  if (result.kind === "needs_2fa") return rejected("2FA did not complete");
  return result;
}


export {
  isUsableAccountApiKey,
  persistSyncedMgooleCredential,
  selectMgooleModelCredential,
  syncMgooleModelCredential,
} from "./mgooleAccountKeys.js";
export {
  loadPaymentMethods,
  loadPublicLoginSettings,
  loadSharedAccountBilling,
  projectSharedAccountBilling,
  startBalanceRecharge,
  startSharedPlanPurchase,
} from "./mgooleAccountBilling.js";

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function readBrowserAccountSession(): AccountSession | null {
  const raw = storage()?.getItem(MGOOLE_ACCOUNT_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = interpretLoginPayload({ code: 0, data: JSON.parse(raw) });
    return sessionFromLoginResult(parsed);
  } catch {
    return null;
  }
}

export function writeBrowserAccountSession(session: AccountSession | null): void {
  const store = storage();
  if (!store) return;
  if (!session) {
    store.removeItem(MGOOLE_ACCOUNT_SESSION_KEY);
    return;
  }
  store.setItem(
    MGOOLE_ACCOUNT_SESSION_KEY,
    JSON.stringify({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      token_type: session.tokenType,
      expires_in: session.expiresIn,
      user: { id: session.userId, email: session.email },
    }),
  );
}

export function readSyncedKeyId(): string | null {
  return storage()?.getItem(MGOOLE_SYNCED_KEY_ID_KEY) ?? null;
}

export function writeSyncedKeyId(keyId: string | null): void {
  const store = storage();
  if (!store) return;
  if (!keyId) {
    store.removeItem(MGOOLE_SYNCED_KEY_ID_KEY);
    return;
  }
  store.setItem(MGOOLE_SYNCED_KEY_ID_KEY, keyId);
}
