import assert from "node:assert/strict";
import test from "node:test";
import {
  completeMgooleLogin2FA,
  loadSharedAccountBilling,
  loginMgooleAccount,
  persistSyncedMgooleCredential,
  projectSharedAccountBilling,
  sessionFromLoginResult,
  userInfoFromAccountSession,
  loadPublicLoginSettings,
  formatSharedDateTime,
  hasCurrentSharedSubscription,
  limitedSharedWindows,
  formatSharedPrice,
  modelIdsFromModelsPayload,
  paymentLaunchUrl,
  planGroupKeySync,
  remainingSharedDays,
  resolveAccountApiBase,
  startBalanceRecharge,
  startSharedPlanPurchase,
  syncMgooleModelCredential,
  type AccountSession,
  type FetchLike,
  type MgooleProviderWriter,
} from "./mgooleAccount.js";

const BASE = "https://mgoole.com/api/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function envelope(data: unknown, code = 0, message = "success") {
  return { code, message, data };
}

function sessionFor(token: string): AccountSession {
  return {
    accessToken: token,
    refreshToken: "refresh",
    tokenType: "Bearer",
    expiresIn: 3600,
    userId: 7,
    email: "user@example.com",
    authorization: `Bearer ${token}`,
  };
}

test("saved account session becomes the sidebar user", () => {
  const user = userInfoFromAccountSession({
    accessToken: "access-from-login",
    refreshToken: "refresh-from-login",
    tokenType: "Bearer",
    expiresIn: 3600,
    userId: 7,
    email: "user@example.com",
    authorization: "Bearer access-from-login",
  });
  assert.equal(user.id, "7");
  assert.equal(user.displayName, "user@example.com");
  assert.equal(user.username, "user@example.com");
});

test("login success returns a session later account calls can use", async () => {
  const accessToken = "access-from-login";
  const result = await loginMgooleAccount({
    fetchImpl: async (url, init) => {
      assert.equal(url, `${BASE}/auth/login`);
      assert.equal(JSON.parse(String(init?.body)).email, "user@example.com");
      return jsonResponse(
        envelope({
          access_token: accessToken,
          refresh_token: "refresh-from-login",
          expires_in: 3600,
          token_type: "Bearer",
          user: { id: 7, email: "user@example.com", balance: 12.5 },
        }),
      );
    },
    email: "user@example.com",
    password: "correct-password",
  });
  const session = sessionFromLoginResult(result);
  assert.ok(session);
  assert.equal(session.accessToken, accessToken);
  assert.equal(session.authorization, `Bearer ${accessToken}`);
});

test("2FA-required login stays incomplete until the second factor succeeds", async () => {
  const login = await loginMgooleAccount({
    fetchImpl: async () =>
      jsonResponse(
        envelope({
          requires_2fa: true,
          temp_token: "temp-session",
          user_email_masked: "u***@example.com",
        }),
      ),
    email: "user@example.com",
    password: "correct-password",
  });
  assert.equal(login.kind, "needs_2fa");
  assert.equal(sessionFromLoginResult(login), null);

  const failed = await completeMgooleLogin2FA({
    fetchImpl: async (url, init) => {
      assert.equal(url, `${BASE}/auth/login/2fa`);
      assert.equal(JSON.parse(String(init?.body)).totp_code, "000000");
      return jsonResponse(envelope(null, 40001, "invalid totp code"), 400);
    },
    tempToken: "temp-session",
    totpCode: "000000",
  });
  assert.equal(failed.kind, "rejected");
  assert.equal(sessionFromLoginResult(failed), null);

  const completed = await completeMgooleLogin2FA({
    fetchImpl: async () =>
      jsonResponse(
        envelope({
          access_token: "access-after-2fa",
          refresh_token: "refresh-after-2fa",
          token_type: "Bearer",
          user: { id: 7, email: "user@example.com" },
        }),
      ),
    tempToken: "temp-session",
    totpCode: "123456",
  });
  const session = sessionFromLoginResult(completed);
  assert.ok(session);
  assert.equal(session.accessToken, "access-after-2fa");
});

test("wrong credentials and a rejected captcha return no session", async () => {
  const wrong = await loginMgooleAccount({
    fetchImpl: async () => jsonResponse(envelope(null, 40101, "invalid credentials"), 401),
    email: "user@example.com",
    password: "wrong-password",
  });
  assert.equal(wrong.kind, "rejected");
  assert.equal(sessionFromLoginResult(wrong), null);

  const captcha = await loginMgooleAccount({
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { turnstile_token?: string };
      assert.equal(body.turnstile_token, "bad-ticket");
      return jsonResponse(envelope(null, 40021, "captcha rejected"), 400);
    },
    email: "user@example.com",
    password: "correct-password",
    captcha: { turnstileToken: "bad-ticket" },
  });
  assert.equal(captcha.kind, "rejected");
  assert.equal(sessionFromLoginResult(captcha), null);
});

test("payment launch url is the order pay page", () => {
  assert.equal(
    paymentLaunchUrl({ payUrl: "https://pay.example/41" }),
    "https://pay.example/41",
  );
  assert.equal(paymentLaunchUrl({ payUrl: "weixin://pay" }), "");
});

test("desktop dev origin uses the same-origin account proxy", () => {
  assert.equal(
    resolveAccountApiBase(undefined, "http://127.0.0.1:5174"),
    "http://127.0.0.1:5174/mgoole-api/api/v1",
  );
  assert.equal(resolveAccountApiBase(undefined, "file://"), "https://mgoole.com/api/v1");
});

test("public login settings expose the captcha flags from /settings/public", async () => {
  const settings = await loadPublicLoginSettings({
    fetchImpl: async (url) => {
      assert.equal(url, `${BASE}/settings/public`);
      return jsonResponse(
        envelope({
          turnstile_enabled: true,
          turnstile_site_key: "site-from-public",
          tencent_captcha_enabled: true,
          tencent_captcha_app_id: "tencent-app-from-public",
          aliyun_captcha_enabled: false,
        }),
      );
    },
  });
  assert.equal(settings.turnstileEnabled, true);
  assert.equal(settings.turnstileSiteKey, "site-from-public");
  assert.equal(settings.tencentCaptchaEnabled, true);
  assert.equal(settings.tencentCaptchaAppId, "tencent-app-from-public");
  assert.equal(settings.aliyunCaptchaEnabled, false);
});

test("created or changed 芒果AI keys become the model credential without a paste", async () => {
  const created = await syncMgooleModelCredential({
    fetchImpl: async (url) => {
      assert.equal(url, `${BASE}/keys?page=1&page_size=100`);
      return jsonResponse(
        envelope({
          items: [
            {
              id: 9,
              key: "created-key",
              name: "web",
              status: "active",
              expires_at: null,
              updated_at: "2026-09-22T00:00:00Z",
            },
          ],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        }),
      );
    },
    session: sessionFor("access-from-login"),
  });
  assert.equal(created?.access.apiKey, "created-key");
  assert.equal(created?.templateId, "mgoole");

  const changed = await syncMgooleModelCredential({
    fetchImpl: async () =>
      jsonResponse(
        envelope({
          items: [
            {
              id: 9,
              key: "changed-key",
              name: "web",
              status: "active",
              expires_at: null,
              updated_at: "2026-09-22T01:00:00Z",
            },
          ],
          pages: 1,
        }),
      ),
    session: sessionFor("access-from-login"),
    previousKeyId: "9",
  });
  assert.equal(changed?.access.apiKey, "changed-key");

  const stored: { providerId: string; apiKey: string }[] = [];
  const writer: MgooleProviderWriter = {
    async getView() {
      return { providers: [] };
    },
    async saveApiKey(providerId, apiKey) {
      stored.push({ providerId, apiKey });
    },
    async createMgooleProvider(apiKey) {
      stored.push({ providerId: "mgoole-1", apiKey });
      return { providerId: "mgoole-1" };
    },
  };
  const persisted = await persistSyncedMgooleCredential(writer, changed);
  assert.equal(persisted?.apiKey, "changed-key");
  assert.equal(stored[0]?.apiKey, "changed-key");
});

test("removed, inactive, or expired keys are not usable 芒果AI credentials", async () => {
  const removed = await syncMgooleModelCredential({
    fetchImpl: async () =>
      jsonResponse(
        envelope({
          items: [
            {
              id: 3,
              key: "replacement-key",
              name: "other",
              status: "active",
              expires_at: null,
              updated_at: "2026-09-22T02:00:00Z",
            },
          ],
          pages: 1,
        }),
      ),
    session: sessionFor("access-from-login"),
    previousKeyId: "9",
  });
  assert.equal(removed?.access.apiKey, "replacement-key");
  assert.notEqual(removed?.syncedKeyId, "9");

  const unusable = await syncMgooleModelCredential({
    fetchImpl: async () =>
      jsonResponse(
        envelope({
          items: [
            {
              id: 9,
              key: "inactive-secret",
              name: "old",
              status: "inactive",
              expires_at: null,
              updated_at: "2026-09-22T03:00:00Z",
            },
            {
              id: 4,
              key: "expired-secret",
              name: "expired",
              status: "active",
              expires_at: "2020-01-01T00:00:00Z",
              updated_at: "2026-09-22T03:00:00Z",
            },
          ],
          pages: 1,
        }),
      ),
    session: sessionFor("access-from-login"),
    previousKeyId: "9",
    now: Date.parse("2026-09-22T04:00:00Z"),
  });
  assert.equal(unusable, null);
});

test("billing view matches the account payload and ignores the other subscription", async () => {
  const requested: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    requested.push(url);
    if (url.endsWith("/user/profile")) {
      return jsonResponse(envelope({ balance: 18.25, frozen_balance: 1.5, email: "user@example.com" }));
    }
    if (url.endsWith("/shared-subscriptions")) {
      return jsonResponse(
        envelope([
          {
            id: 4,
            plan_id: 8,
            status: "active",
            expires_at: "2026-10-22T00:00:00Z",
            plan: {
              id: 8,
              name: "芒果月卡",
              price: 30,
              validity_days: 30,
              group_ids: [1],
              for_sale: true,
            },
          },
          {
            id: 99,
            group_id: 3,
            group_name: "分组订阅",
            status: "active",
            expires_at: "2026-11-01T00:00:00Z",
          },
        ]),
      );
    }
    if (url.endsWith("/shared-subscriptions/plans")) {
      return jsonResponse(
        envelope([
          {
            id: 8,
            name: "芒果月卡",
            price: 30,
            validity_days: 30,
            group_ids: [1],
            for_sale: true,
          },
          {
            id: 15,
            group_id: 3,
            name: "分组套餐",
            price: 99,
            validity_days: 30,
            validity_unit: "day",
            for_sale: true,
          },
        ]),
      );
    }
    throw new Error(`unexpected ${url}`);
  };
  const view = await loadSharedAccountBilling({
    fetchImpl,
    session: sessionFor("access-from-login"),
  });
  assert.equal(view.balance, 18.25);
  assert.equal(view.frozenBalance, 1.5);
  assert.deepEqual(
    view.entitlements.map((item) => ({
      name: item.name,
      price: item.price,
      validityDays: item.validityDays,
      status: item.status,
      expiresAt: item.expiresAt,
    })),
    [
      {
        name: "芒果月卡",
        price: 30,
        validityDays: 30,
        status: "active",
        expiresAt: "2026-10-22T00:00:00Z",
      },
    ],
  );
  assert.equal(view.plans.some((plan) => plan.name === "分组套餐"), false);
  assert.equal(requested.some((url) => url.includes("/subscriptions") && !url.includes("shared-subscriptions")), false);
  assert.equal(JSON.stringify(view).includes("分组订阅"), false);
});

test("projectSharedAccountBilling drops a mixed non-shared subscription", () => {
  const view = projectSharedAccountBilling({
    profile: { balance: 4, frozen_balance: 0 },
    sharedSubscriptions: [
      {
        id: 1,
        status: "active",
        expires_at: "2026-10-01T00:00:00Z",
        plan: { id: 2, name: "共享", price: 10, validity_days: 30, group_ids: [1], for_sale: true },
      },
    ],
    sharedPlans: [],
    groupSubscriptions: [
      { id: 9, group_id: 3, group_name: "不应展示", status: "active", expires_at: "2026-12-01T00:00:00Z" },
    ],
  });
  assert.equal(view.balance, 4);
  assert.equal(view.entitlements.length, 1);
  assert.equal(view.entitlements[0]?.name, "共享");
  assert.equal(JSON.stringify(view).includes("不应展示"), false);
  assert.equal(hasCurrentSharedSubscription(view.entitlements), true);
  assert.equal(hasCurrentSharedSubscription([{ status: "revoked" }, { status: "expired" }]), false);
});

test("shared billing keeps plan details, quota windows, and a readable expiry", () => {
  const view = projectSharedAccountBilling({
    profile: { balance: 12, frozen_balance: 0 },
    sharedSubscriptions: [
      {
        id: 4,
        status: "active",
        starts_at: "2026-09-23T02:01:09.341853+08:00",
        expires_at: "2026-10-23T10:01:09.341853+08:00",
        plan: {
          id: 2,
          name: "月卡-2",
          description: "共享月卡",
          price: 340,
          validity_days: 30,
          group_ids: [1],
          group_names: { "1": "默认分组" },
          daily_limit_usd: 10,
          weekly_limit_usd: null,
          monthly_limit_usd: 100,
          for_sale: true,
        },
        windows: [
          { kind: "daily", limit: 10, used: 2.5, reserved: 0.5, resets_at: "2026-09-24T00:00:00+08:00" },
          { kind: "weekly", limit: null, used: 2.5, reserved: 0, resets_at: "2026-09-28T00:00:00+08:00" },
          { kind: "monthly", limit: 100, used: 8, reserved: 0, resets_at: "2026-10-23T00:00:00+08:00" },
        ],
      },
    ],
    sharedPlans: [
      {
        id: 2,
        name: "月卡-2",
        description: "共享月卡",
        price: 340,
        validity_days: 30,
        group_ids: [1],
        group_names: { "1": "默认分组" },
        daily_limit_usd: 10,
        weekly_limit_usd: null,
        monthly_limit_usd: 100,
        for_sale: true,
      },
    ],
  });
  assert.equal(view.plans[0]?.description, "共享月卡");
  assert.equal(view.plans[0]?.dailyLimit, 10);
  assert.equal(view.plans[0]?.weeklyLimit, null);
  assert.deepEqual(view.plans[0]?.groupNames, ["默认分组"]);
  assert.equal(view.entitlements[0]?.windows[0]?.used, 2.5);
  assert.deepEqual(
    limitedSharedWindows(view.entitlements[0]?.windows ?? []).map((window) => window.kind),
    ["daily", "monthly"],
  );
  const formatted = formatSharedDateTime("2026-10-23T10:01:09.341853+08:00", "zh-CN");
  assert.equal(formatted.includes("2026"), true);
  assert.equal(formatted.includes("341853"), false);
  assert.equal(
    remainingSharedDays("2026-10-23T10:01:09+08:00", Date.parse("2026-09-23T10:01:09+08:00")),
    30,
  );
});

test("prices include the yuan unit and keys from different groups become different models", () => {
  assert.equal(formatSharedPrice(340), "340 元");
  assert.equal(formatSharedPrice(10.5), "10.5 元");
  const plans = planGroupKeySync([
    {
      id: 1,
      key: "grok-key",
      name: "old",
      status: "active",
      expiresAt: null,
      updatedAt: "2026-09-01T00:00:00Z",
      groupId: 7,
      groupName: "grok(自建号池)",
    },
    {
      id: 2,
      key: "grok-key-new",
      name: "new",
      status: "active",
      expiresAt: null,
      updatedAt: "2026-09-22T00:00:00Z",
      groupId: 7,
      groupName: "grok(自建号池)",
    },
    {
      id: 3,
      key: "deepseek-key",
      name: "deepseek",
      status: "active",
      expiresAt: null,
      updatedAt: "2026-09-20T00:00:00Z",
      groupId: 8,
      groupName: "deepseek(便宜)",
    },
    {
      id: 4,
      key: "disabled-key",
      name: "off",
      status: "disabled",
      expiresAt: null,
      updatedAt: "2026-09-23T00:00:00Z",
      groupId: 9,
      groupName: "停用",
    },
  ]);
  assert.deepEqual(
    plans.map((plan) => ({ name: plan.providerName, model: plan.modelId, key: plan.apiKey })),
    [
      { name: "grok(自建号池)", model: "grok(自建号池)", key: "grok-key-new" },
      { name: "deepseek(便宜)", model: "deepseek(便宜)", key: "deepseek-key" },
    ],
  );
  assert.deepEqual(
    modelIdsFromModelsPayload({ data: [{ id: "grok-4.7" }, { id: "grok-4" }] }),
    ["grok-4.7", "grok-4"],
  );
});

test("recharge and shared-plan purchase return the payment order identity", async () => {
  const bodies: unknown[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    assert.equal(url, `${BASE}/payment/orders`);
    bodies.push(JSON.parse(String(init?.body)));
    const body = JSON.parse(String(init?.body)) as { order_type: string };
    const orderId = body.order_type === "balance" ? 41 : 77;
    return jsonResponse(
      envelope({
        order_id: orderId,
        out_trade_no: `OT${orderId}`,
        status: "PENDING",
        pay_url: `https://pay.example/${orderId}`,
        qr_code: "",
      }),
    );
  };
  const session = sessionFor("access-from-login");
  const recharge = await startBalanceRecharge({
    fetchImpl,
    session,
    amount: 20,
    paymentType: "alipay",
  });
  assert.equal(recharge.orderId, 41);
  assert.equal(recharge.orderType, "balance");
  assert.equal((bodies[0] as { order_type: string }).order_type, "balance");

  const purchase = await startSharedPlanPurchase({
    fetchImpl,
    session,
    planId: 8,
    amount: 30,
    paymentType: "alipay",
  });
  assert.equal(purchase.orderId, 77);
  assert.equal(purchase.orderType, "shared_subscription");
  assert.equal((bodies[1] as { order_type: string }).order_type, "shared_subscription");
  assert.equal((bodies[1] as { plan_id: number }).plan_id, 8);
});
