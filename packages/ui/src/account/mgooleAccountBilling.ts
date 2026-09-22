import {
  asNumber,
  asRecord,
  asString,
  getJson,
  postJson,
  readJson,
  unwrapData,
  MGOOLE_ACCOUNT_API_BASE,
  type AccountBillingView,
  type AccountSession,
  type FetchLike,
  type PaymentMethodOption,
  type PaymentOrderStart,
  type PublicLoginSettings,
  type SharedEntitlement,
  type SharedPlanOffer,
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

function toPlanOffer(value: Record<string, unknown>): SharedPlanOffer | null {
  const id = asNumber(value.id);
  const validityDays = asNumber(value.validity_days);
  const price = asNumber(value.price);
  if (id === null || validityDays === null || price === null) return null;
  return {
    id,
    name: asString(value.name),
    price,
    validityDays,
    forSale: value.for_sale !== false,
  };
}

function toEntitlement(value: Record<string, unknown>): SharedEntitlement | null {
  const plan = asRecord(value.plan);
  if (!plan || !isSharedPlanRecord(plan)) return null;
  const offer = toPlanOffer(plan);
  const id = asNumber(value.id);
  if (!offer || id === null) return null;
  return {
    id,
    planId: offer.id,
    name: offer.name,
    price: offer.price,
    validityDays: offer.validityDays,
    status: asString(value.status),
    expiresAt: asString(value.expires_at),
  };
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
  const baseUrl = (input.baseUrl ?? MGOOLE_ACCOUNT_API_BASE).replace(/\/+$/, "");
  const [profile, sharedSubscriptions, sharedPlans] = await Promise.all([
    getJson(input.fetchImpl, `${baseUrl}/user/profile`, input.session),
    getJson(input.fetchImpl, `${baseUrl}/shared-subscriptions`, input.session),
    getJson(input.fetchImpl, `${baseUrl}/shared-subscriptions/plans`, input.session),
  ]);
  return projectSharedAccountBilling({ profile, sharedSubscriptions, sharedPlans });
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
  const baseUrl = (input.baseUrl ?? MGOOLE_ACCOUNT_API_BASE).replace(/\/+$/, "");
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
  const baseUrl = (input.baseUrl ?? MGOOLE_ACCOUNT_API_BASE).replace(/\/+$/, "");
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
  const baseUrl = (input.baseUrl ?? MGOOLE_ACCOUNT_API_BASE).replace(/\/+$/, "");
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
  const baseUrl = (input.baseUrl ?? MGOOLE_ACCOUNT_API_BASE).replace(/\/+$/, "");
  const payload = await getJson(input.fetchImpl, `${baseUrl}/payment/config`, input.session);
  const record = asRecord(payload);
  const types = Array.isArray(record?.enabled_payment_types) ? record.enabled_payment_types : [];
  return types.flatMap((item) => {
    const id = asString(item).trim();
    return id ? [{ id, label: id }] : [];
  });
}

