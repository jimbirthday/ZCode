import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { toast } from "@/components/ui/toast.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { AccountLoginForm } from "./AccountLoginForm.js";
import { SharedEntitlementCard, SharedPlanCard } from "./SharedSubscriptionDetails.js";
import { rememberSharedAccountBilling } from "./sharedSubscriptionPresence.js";
import {
  accountPageFetch,
  loadPaymentMethods,
  loadSharedAccountBilling,
  paymentLaunchUrl,
  readBrowserAccountSession,
  startSharedPlanPurchase,
  type AccountBillingView,
  type AccountSession,
  type PaymentMethodOption,
} from "./mgooleAccount.js";

const EMPTY_VIEW: AccountBillingView = {
  balance: 0,
  frozenBalance: 0,
  entitlements: [],
  plans: [],
};

export function SubscriptionSettingsSection() {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const [session, setSession] = useState<AccountSession | null>(() => readBrowserAccountSession());
  const [view, setView] = useState<AccountBillingView>(EMPTY_VIEW);
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentType, setPaymentType] = useState("");
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (current: AccountSession) => {
    setLoading(true);
    try {
      const [billing, paymentMethods] = await Promise.all([
        loadSharedAccountBilling({ fetchImpl: accountPageFetch, session: current }),
        loadPaymentMethods({ fetchImpl: accountPageFetch, session: current }),
      ]);
      setView(billing);
      rememberSharedAccountBilling(billing);
      setMethods(paymentMethods);
      setPaymentType((currentType) => currentType || paymentMethods[0]?.id || "");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { variant: "warning" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void refresh(session);
  }, [refresh, session]);

  useEffect(() => {
    if (!session) return;
    const onFocus = () => {
      void refresh(session);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, session]);

  const buyPlan = async (planId: number, price: number, renewSubscriptionId?: number) => {
    if (!session || !paymentType) return;
    setBusyPlanId(planId);
    try {
      const created = await startSharedPlanPurchase({
        fetchImpl: accountPageFetch,
        session,
        planId,
        amount: price,
        paymentType,
        renewSubscriptionId,
      });
      const url = paymentLaunchUrl(created);
      if (url) platform.openExternal(url);
      else {
        toast(
          intl.formatMessage({ id: "settings.account.orderOpened" }, { orderId: created.orderId }),
          { variant: "warning" },
        );
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { variant: "warning" });
    } finally {
      setBusyPlanId(null);
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
    <div className="space-y-8" data-testid="subscription-settings">
      <section className="space-y-3">
        <h3 className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "settings.subscription.current" })}
        </h3>
        {view.entitlements.length === 0 ? (
          <SettingsGroupCard>
            <SettingsRow
              label={intl.formatMessage({ id: "settings.subscription.current" })}
              description={
                loading ? "…" : intl.formatMessage({ id: "settings.subscription.currentEmpty" })
              }
              control={null}
            />
          </SettingsGroupCard>
        ) : (
          <div className="space-y-3">
            {view.entitlements.map((item) => (
              <SharedEntitlementCard
                key={item.id}
                name={item.name || intl.formatMessage({ id: "settings.subscription.current" })}
                description={item.description}
                status={item.status}
                startsAt={item.startsAt}
                expiresAt={item.expiresAt}
                price={item.price}
                validityDays={item.validityDays}
                groupNames={item.groupNames}
                windows={item.windows}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={busyPlanId !== null}
                    onClick={() => void buyPlan(item.planId, item.price, item.id)}
                  >
                    {intl.formatMessage({ id: "settings.account.renew" })}
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-ui-base font-medium text-foreground">
              {intl.formatMessage({ id: "settings.subscription.purchase" })}
            </h3>
            <p className="mt-1 text-ui-base text-foreground-subtle">
              {view.plans.length === 0 && !loading
                ? intl.formatMessage({ id: "settings.subscription.purchaseEmpty" })
                : intl.formatMessage({ id: "settings.account.upgradeDescription" })}
            </p>
          </div>
          <Select value={paymentType} onValueChange={setPaymentType}>
            <SelectTrigger
              size="lg"
              className="h-10 w-40 text-ui-base"
              aria-label={intl.formatMessage({ id: "settings.account.paymentType" })}
            >
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {view.plans.map((plan) => (
            <SharedPlanCard
              key={plan.id}
              plan={plan}
              action={
                <Button
                  type="button"
                  size="lg"
                  disabled={busyPlanId !== null || !paymentType}
                  data-testid={`subscription-buy-${plan.id}`}
                  onClick={() => void buyPlan(plan.id, plan.price)}
                >
                  {intl.formatMessage({ id: "settings.account.buy" })}
                </Button>
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}
