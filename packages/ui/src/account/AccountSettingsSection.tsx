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
  accountPageFetch,
  loadPaymentMethods,
  loadSharedAccountBilling,
  paymentLaunchUrl,
  persistSyncedMgooleCredential,
  readBrowserAccountSession,
  userInfoFromAccountSession,
  readSyncedKeyId,
  startBalanceRecharge,
  syncMgooleModelCredential,
  writeBrowserAccountSession,
  writeSyncedKeyId,
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

export function AccountSettingsSection() {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const { providerSettingsService, modelSelectionService } = useServices();
  const markApiKeyLoginSuccess = useZCodeStore((state) => state.markApiKeyLoginSuccess);
  const setUser = useZCodeStore((state) => state.setUser);
  const [session, setSession] = useState<AccountSession | null>(() => readBrowserAccountSession());
  const [view, setView] = useState<AccountBillingView>(EMPTY_VIEW);
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentType, setPaymentType] = useState("");
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (current: AccountSession) => {
    setLoading(true);
    try {
      const [billing, paymentMethods, credential] = await Promise.all([
        loadSharedAccountBilling({ fetchImpl: accountPageFetch, session: current }),
        loadPaymentMethods({ fetchImpl: accountPageFetch, session: current }),
        syncMgooleModelCredential({
          fetchImpl: accountPageFetch,
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
    if (session) setUser(userInfoFromAccountSession(session));
  }, [session, setUser]);

  useEffect(() => {
    if (session) void refresh(session);
  }, [refresh, session]);

  const recharge = async () => {
    if (!session || !paymentType) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    try {
      const created = await startBalanceRecharge({
        fetchImpl: accountPageFetch,
        session,
        amount: parsed,
        paymentType,
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
      </SettingsGroupCard>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => {
          writeBrowserAccountSession(null);
          writeSyncedKeyId(null);
          setUser(null);
          setSession(null);
          setView(EMPTY_VIEW);
        }}
      >
        {intl.formatMessage({ id: "settings.account.logout" })}
      </Button>
    </div>
  );
}
