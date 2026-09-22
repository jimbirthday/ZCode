import { useCallback, useEffect, useState } from "react";
import { isApiKeyAccess } from "@zcode/provider";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { toast } from "@/components/ui/toast.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { buildLoginApiKeyDefaultModelPreferenceFromSelection } from "@/login/LoginApiKeyForm.helpers.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { AccountLoginForm } from "./AccountLoginForm.js";
import {
  loadPaymentMethods,
  loadSharedAccountBilling,
  persistSyncedMgooleCredential,
  readBrowserAccountSession,
  readSyncedKeyId,
  startBalanceRecharge,
  startSharedPlanPurchase,
  syncMgooleModelCredential,
  writeBrowserAccountSession,
  writeSyncedKeyId,
  type AccountBillingView,
  type AccountSession,
  type PaymentMethodOption,
  type PaymentOrderStart,
} from "./mgooleAccount.js";

const EMPTY_VIEW: AccountBillingView = {
  balance: 0,
  frozenBalance: 0,
  entitlements: [],
  plans: [],
};

export function AccountSettingsSection() {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const { providerSettingsService, modelSelectionService } = useServices();
  const markApiKeyLoginSuccess = useZCodeStore((state) => state.markApiKeyLoginSuccess);
  const [session, setSession] = useState<AccountSession | null>(() => readBrowserAccountSession());
  const [view, setView] = useState<AccountBillingView>(EMPTY_VIEW);
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentType, setPaymentType] = useState("");
  const [amount, setAmount] = useState("10");
  const [order, setOrder] = useState<PaymentOrderStart | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (current: AccountSession) => {
    setLoading(true);
    try {
      const [billing, paymentMethods, credential] = await Promise.all([
        loadSharedAccountBilling({ fetchImpl: fetch, session: current }),
        loadPaymentMethods({ fetchImpl: fetch, session: current }),
        syncMgooleModelCredential({
          fetchImpl: fetch,
          session: current,
          previousKeyId: readSyncedKeyId(),
        }),
      ]);
      setView(billing);
      setMethods(paymentMethods);
      setPaymentType((currentType) => currentType || paymentMethods[0]?.id || "");
      const persisted = await persistSyncedMgooleCredential(
        {
          async getView() {
            const providerView = await providerSettingsService.getView();
            return {
              providers: providerView.providers.map((provider) => ({
                providerId: provider.providerId,
                templateId: provider.templateId,
              })),
            };
          },
          async saveApiKey(providerId, apiKey) {
            const providerView = await providerSettingsService.getView();
            const provider = providerView.providers.find((item) => item.providerId === providerId);
            const accessType = isApiKeyAccess(provider?.effectiveConfig.access)
              ? provider.effectiveConfig.access.type
              : "api-key";
            await providerSettingsService.savePersonalProviderOverlay(providerId, {
              access: { type: accessType, apiKey },
            });
          },
          async createMgooleProvider(apiKey) {
            const template = (await providerSettingsService.getView()).providerTemplates.find(
              (item) => item.templateId === "mgoole",
            );
            const accessType = isApiKeyAccess(template?.config.access)
              ? template.config.access.type
              : "api-key";
            const created = await providerSettingsService.createPersonalProvider({
              templateId: "mgoole",
              initialConfig: { access: { type: accessType, apiKey } },
            });
            return { providerId: created.providerId };
          },
        },
        credential,
      );
      writeSyncedKeyId(credential?.syncedKeyId ?? null);
      if (persisted) {
        const preference = buildLoginApiKeyDefaultModelPreferenceFromSelection(
          await modelSelectionService.getView(),
          persisted.providerId,
        );
        markApiKeyLoginSuccess(preference);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { variant: "warning" });
    } finally {
      setLoading(false);
    }
  }, [markApiKeyLoginSuccess, modelSelectionService, providerSettingsService]);

  useEffect(() => {
    if (session) void refresh(session);
  }, [refresh, session]);

  const recharge = async () => {
    if (!session || !paymentType) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    try {
      const created = await startBalanceRecharge({
        fetchImpl: fetch,
        session,
        amount: parsed,
        paymentType,
      });
      setOrder(created);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { variant: "warning" });
    }
  };

  const buyPlan = async (planId: number, price: number, renewSubscriptionId?: number) => {
    if (!session || !paymentType) return;
    try {
      const created = await startSharedPlanPurchase({
        fetchImpl: fetch,
        session,
        planId,
        amount: price,
        paymentType,
        renewSubscriptionId,
      });
      setOrder(created);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { variant: "warning" });
    }
  };

  if (!session) {
    return (
      <AccountLoginForm
        onUseApiKey={() => undefined}
        onLoggedIn={() => setSession(readBrowserAccountSession())}
      />
    );
  }

  return (
    <div className="space-y-8" data-testid="account-settings">
      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.account.balance" })}
          description={intl.formatMessage(
            { id: "settings.account.frozenBalance" },
            { amount: view.frozenBalance },
          )}
          control={
            <span className="text-ui-base font-medium text-foreground" data-testid="account-balance">
              {loading ? "…" : view.balance}
            </span>
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.account.recharge" })}
          controlLayout="wide"
          control={
            <Button type="button" size="lg" data-testid="account-recharge" onClick={() => void recharge()}>
              {intl.formatMessage({ id: "settings.account.rechargeAction" })}
            </Button>
          }
          detail={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                size="lg"
                className="h-10 w-32 text-ui-base"
                value={amount}
                aria-label={intl.formatMessage({ id: "settings.account.amount" })}
                onChange={(event) => setAmount(event.target.value)}
              />
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger size="lg" className="h-10 w-40 text-ui-base">
                  <SelectValue placeholder={intl.formatMessage({ id: "settings.account.paymentType" })} />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
        {order ? (
          <SettingsRow
            label={intl.formatMessage({ id: "settings.account.order" })}
            description={order.orderType === "shared_subscription" ? order.outTradeNo : order.outTradeNo}
            control={
              <span className="text-ui-base text-foreground" data-testid="account-order-id">
                {order.orderId}
              </span>
            }
            detail={
              order.payUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => platform.openExternal(order.payUrl)}
                >
                  {intl.formatMessage({ id: "settings.account.openPayUrl" })}
                </Button>
              ) : null
            }
          />
        ) : null}
      </SettingsGroupCard>
      <SettingsGroupCard>
        {view.entitlements.length === 0 && view.plans.length === 0 ? (
          <SettingsRow
            label={intl.formatMessage({ id: "settings.account.sharedTitle" })}
            description={intl.formatMessage({ id: "settings.account.sharedEmpty" })}
            control={<span className="text-ui-base text-foreground-subtle">—</span>}
          />
        ) : null}
        {view.entitlements.map((item) => (
          <SettingsRow
            key={item.id}
            label={item.name}
            description={intl.formatMessage(
              { id: "settings.account.sharedEntitlement" },
              {
                status: item.status,
                days: item.validityDays,
                expires: item.expiresAt,
                price: item.price,
              },
            )}
            control={
              <Button
                type="button"
                variant="outline"
                size="lg"
                data-testid="account-shared-renew"
                onClick={() => void buyPlan(item.planId, item.price, item.id)}
              >
                {intl.formatMessage({ id: "settings.account.renew" })}
              </Button>
            }
          />
        ))}
        {view.plans.map((plan) => (
          <SettingsRow
            key={plan.id}
            label={plan.name}
            description={intl.formatMessage(
              { id: "settings.account.sharedPlan" },
              { days: plan.validityDays, price: plan.price },
            )}
            control={
              <Button
                type="button"
                size="lg"
                data-testid="account-shared-buy"
                onClick={() => void buyPlan(plan.id, plan.price)}
              >
                {intl.formatMessage({ id: "settings.account.buy" })}
              </Button>
            }
          />
        ))}
      </SettingsGroupCard>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => {
          writeBrowserAccountSession(null);
          setSession(null);
          setView(EMPTY_VIEW);
          setOrder(null);
        }}
      >
        {intl.formatMessage({ id: "settings.account.logout" })}
      </Button>
    </div>
  );
}
