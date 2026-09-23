import {
  asNumber,
  asRecord,
  asString,
  getJson,
  postJson,
  readJson,
  unwrapData,
  resolveAccountApiBase,
  type AccountBillingView,
  type AccountSession,
  type FetchLike,
  type PaymentMethodOption,
  type PaymentOrderStart,
  type PublicLoginSettings,
  type SharedEntitlement,
  type SharedPlanOffer,
  type SharedQuotaKind,
  type SharedQuotaWindow,
} from "./mgooleAccount.js";

function isSharedPlanRecord(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value);
  if (!record) return false;
  if (record.group_id !== undefined && record.group_ids === undefined) return false;
  if (record.validity_unit !== undefined && record.group_ids === undefined) return false;
  return Array.isArray(record.group_ids) && asNumber(record.validity_days) !== null;
}

function isSharedSubscriptionRecord(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  if (record.group_id !== undefined && !isSharedPlanRecord(record.plan)) return false;
  return isSharedPlanRecord(record.plan);
}

function groupNamesFrom(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) return [];
  return Object.values(record).flatMap((item) => {
    if (typeof item !== "string") return [];
    const name = item.trim();
    return name ? [name] : [];
  });
}

function toQuotaWindow(value: unknown): SharedQuotaWindow | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = asString(record.kind);
  if (kind !== "daily" && kind !== "weekly" && kind !== "monthly") return null;
  return {
    kind,
    limit: asNumber(record.limit),
    used: asNumber(record.used) ?? 0,
    reserved: asNumber(record.reserved) ?? 0,
    resetsAt: asString(record.resets_at),
  };
}

function toPlanOffer(value: Record<string, unknown>): SharedPlanOffer | null {
  const id = asNumber(value.id);
  const validityDays = asNumber(value.validity_days);
  const price = asNumber(value.price);
  if (id === null || validityDays === null || price === null) return null;
  return {
    id,
    name: asString(value.name),
    description: asString(value.description),
    price,
    validityDays,
    forSale: value.for_sale !== false,
    groupNames: groupNamesFrom(value.group_names),
    dailyLimit: asNumber(value.daily_limit_usd),
    weeklyLimit: asNumber(value.weekly_limit_usd),
    monthlyLimit: asNumber(value.monthly_limit_usd),
  };
}

function toEntitlement(value: Record<string, unknown>): SharedEntitlement | null {
  const plan = asRecord(value.plan);
  if (!plan || !isSharedPlanRecord(plan)) return null;
  const offer = toPlanOffer(plan);
  const id = asNumber(value.id);
  if (!offer || id === null) return null;
  const windows = Array.isArray(value.windows)
    ? value.windows.flatMap((item) => {
        const window = toQuotaWindow(item);
        return window ? [window] : [];
      })
    : [];
  return {
    id,
    planId: offer.id,
    name: offer.name,
    description: offer.description,
    price: offer.price,
    validityDays: offer.validityDays,
    status: asString(value.status),
    startsAt: asString(value.starts_at),
    expiresAt: asString(value.expires_at),
    groupNames: offer.groupNames,
    windows,
  };
}

export function formatSharedAmount(value: number): string {
  if (!Number.isFinite(value)) return "";
  const digits = Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 6 : Math.abs(value) < 1 ? 4 : 2;
  return value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatSharedPrice(value: number): string {
  const amount = formatSharedAmount(value);
  return amount ? `${amount} 元` : "";
}

export function formatSharedDateTime(value: string, locale: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

export function remainingSharedDays(expiresAt: string, now = Date.now()): number | null {
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return null;
  const duration = time - now;
  if (duration <= 0) return 0;
  return Math.ceil(duration / 86_400_000);
}

export function limitedSharedWindows(windows: readonly SharedQuotaWindow[]): SharedQuotaWindow[] {
  return windows.filter((window) => window.limit !== null && window.limit > 0);
}

export function sharedWindowUsagePercent(window: Pick<SharedQuotaWindow, "limit" | "used" | "reserved">): number {
  if (window.limit === null || window.limit <= 0) return 0;
  return Math.min(100, Math.max(0, ((window.used + window.reserved) / window.limit) * 100));
}

export function sharedPlanLimit(
  plan: Pick<SharedPlanOffer, "dailyLimit" | "weeklyLimit" | "monthlyLimit">,
  kind: SharedQuotaKind,
): number | null {
  if (kind === "daily") return plan.dailyLimit;
  if (kind === "weekly") return plan.weeklyLimit;
  return plan.monthlyLimit;
}

function listFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record?.items)) return record.items;
  return [];
}

export function projectSharedAccountBilling(input: {
  profile: unknown;
  sharedSubscriptions: unknown;
  sharedPlans: unknown;
  groupSubscriptions?: unknown;
}): AccountBillingView {
  const profile = asRecord(input.profile);
  const subscriptions = listFrom(input.sharedSubscriptions).filter(isSharedSubscriptionRecord);
  const plans = listFrom(input.sharedPlans).flatMap((item) => {
    const record = asRecord(item);
    if (!record || !isSharedPlanRecord(record)) return [];
    const offer = toPlanOffer(record);
    return offer ? [offer] : [];
  });
  return {
    balance: profile ? (asNumber(profile.balance) ?? 0) : 0,
    frozenBalance: profile ? (asNumber(profile.frozen_balance) ?? 0) : 0,
    entitlements: subscriptions.flatMap((item) => {
      const record = asRecord(item);
      if (!record) return [];
      const entitlement = toEntitlement(record);
      return entitlement ? [entitlement] : [];
    }),
    plans: plans.filter((plan) => plan.forSale),
  };
}

export async function loadSharedAccountBilling(input: {
  fetchImpl: FetchLike;
  session: AccountSession;
  baseUrl?: string;
}): Promise<AccountBillingView> {
  const baseUrl = resolveAccountApiBase(input.baseUrl);
  const [profile, sharedSubscriptions, sharedPlans] = await Promise.all([
    getJson(input.fetchImpl, `${baseUrl}/user/profile`, input.session),
    getJson(input.fetchImpl, `${baseUrl}/shared-subscriptions`, input.session),
    getJson(input.fetchImpl, `${baseUrl}/shared-subscriptions/plans`, input.session),
  ]);
  return projectSharedAccountBilling({ profile, sharedSubscriptions, sharedPlans });
}

export function hasCurrentSharedSubscription(
  entitlements: ReadonlyArray<Pick<SharedEntitlement, "status">>,
): boolean {
  return entitlements.some((item) => item.status !== "revoked" && item.status !== "expired");
}

export function paymentLaunchUrl(order: Pick<PaymentOrderStart, "payUrl">): string {
  const url = order.payUrl.trim();
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  return "";
}

function orderFromPayload(
  payload: unknown,
  orderType: PaymentOrderStart["orderType"],
): PaymentOrderStart {
  const data = asRecord(unwrapData(payload));
  const orderId = data ? asNumber(data.order_id) : null;
  if (!data || orderId === null) {
    throw new Error("payment order did not return order_id");
  }
  return {
    orderId,
    orderType,
    outTradeNo: asString(data.out_trade_no),
    payUrl: asString(data.pay_url),
    qrCode: asString(data.qr_code),
    status: asString(data.status),
  };
}

export async function startBalanceRecharge(input: {
  fetchImpl: FetchLike;
  session: AccountSession;
  amount: number;
  paymentType: string;
  baseUrl?: string;
}): Promise<PaymentOrderStart> {
  const baseUrl = resolveAccountApiBase(input.baseUrl);
  const { response, body } = await postJson(
    input.fetchImpl,
    `${baseUrl}/payment/orders`,
    {
      amount: input.amount,
      payment_type: input.paymentType,
      order_type: "balance",
    },
    input.session,
  );
  if (!response.ok) {
    const record = asRecord(body);
    throw new Error(record ? asString(record.message) || "recharge failed" : "recharge failed");
  }
  return orderFromPayload(body, "balance");
}

export async function startSharedPlanPurchase(input: {
  fetchImpl: FetchLike;
  session: AccountSession;
  planId: number;
  amount: number;
  paymentType: string;
  renewSubscriptionId?: number;
  baseUrl?: string;
}): Promise<PaymentOrderStart> {
  const baseUrl = resolveAccountApiBase(input.baseUrl);
  const { response, body } = await postJson(
    input.fetchImpl,
    `${baseUrl}/payment/orders`,
    {
      amount: input.amount,
      payment_type: input.paymentType,
      order_type: "shared_subscription",
      plan_id: input.planId,
      ...(input.renewSubscriptionId ? { renew_subscription_id: input.renewSubscriptionId } : {}),
    },
    input.session,
  );
  if (!response.ok) {
    const record = asRecord(body);
    throw new Error(record ? asString(record.message) || "purchase failed" : "purchase failed");
  }
  return orderFromPayload(body, "shared_subscription");
}


export async function loadPublicLoginSettings(input: {
  fetchImpl: FetchLike;
  baseUrl?: string;
}): Promise<PublicLoginSettings> {
  const baseUrl = resolveAccountApiBase(input.baseUrl);
  const response = await input.fetchImpl(`${baseUrl}/settings/public`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const body = unwrapData(await readJson(response));
  const record = asRecord(body) ?? {};
  return {
    turnstileEnabled: record.turnstile_enabled === true,
    turnstileSiteKey: asString(record.turnstile_site_key),
    tencentCaptchaEnabled: record.tencent_captcha_enabled === true,
    tencentCaptchaAppId: asString(record.tencent_captcha_app_id),
    aliyunCaptchaEnabled: record.aliyun_captcha_enabled === true,
  };
}

export async function loadPaymentMethods(input: {
  fetchImpl: FetchLike;
  session: AccountSession;
  baseUrl?: string;
}): Promise<PaymentMethodOption[]> {
  const baseUrl = resolveAccountApiBase(input.baseUrl);
  const payload = await getJson(input.fetchImpl, `${baseUrl}/payment/config`, input.session);
  const record = asRecord(payload);
  const types = Array.isArray(record?.enabled_payment_types) ? record.enabled_payment_types : [];
  return types.flatMap((item) => {
    const id = asString(item).trim();
    return id ? [{ id, label: id }] : [];
  });
}

