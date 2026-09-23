import { useEffect, useState } from "react";
import { Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { isApiKeyAccess } from "@zcode/provider";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { buildLoginApiKeyDefaultModelPreferenceFromSelection } from "@/login/LoginApiKeyForm.helpers.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import {
  completeMgooleLogin2FA,
  accountPageFetch,
  loadPublicLoginSettings,
  loginMgooleAccount,
  persistSyncedMgooleCredential,
  readSyncedKeyId,
  sessionFromLoginResult,
  syncMgooleModelCredential,
  userInfoFromAccountSession,
  writeBrowserAccountSession,
  writeSyncedKeyId,
  type PublicLoginSettings,
} from "./mgooleAccount.js";

interface AccountLoginFormProps {
  onUseApiKey: () => void;
  onLoggedIn: () => void | Promise<void>;
}

const EMPTY_SETTINGS: PublicLoginSettings = {
  turnstileEnabled: false,
  turnstileSiteKey: "",
  tencentCaptchaEnabled: false,
  tencentCaptchaAppId: "",
  aliyunCaptchaEnabled: false,
};

export function AccountLoginForm({ onUseApiKey, onLoggedIn }: AccountLoginFormProps) {
  const { intl } = useZCodeIntl();
  const { providerSettingsService, modelSelectionService } = useServices();
  const markApiKeyLoginSuccess = useZCodeStore((state) => state.markApiKeyLoginSuccess);
  const setUser = useZCodeStore((state) => state.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [tencentTicket, setTencentTicket] = useState("");
  const [tencentRandstr, setTencentRandstr] = useState("");
  const [settings, setSettings] = useState<PublicLoginSettings>(EMPTY_SETTINGS);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPublicLoginSettings({ fetchImpl: accountPageFetch })
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch((loadError) => {
        logger.warn("[AccountLogin] 读取公开登录设置失败", { error: loadError });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applySyncedKey = async (accessToken: string) => {
    const session = sessionFromLoginResult({
      kind: "session",
      session: {
        accessToken,
        refreshToken: "",
        tokenType: "Bearer",
        expiresIn: null,
        userId: null,
        email,
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (!session) return;
    const credential = await syncMgooleModelCredential({
      fetchImpl: accountPageFetch,
      session,
      previousKeyId: readSyncedKeyId(),
    });
    const persisted = await persistSyncedMgooleCredential(
      {
        async getView() {
          const view = await providerSettingsService.getView();
          return {
            providers: view.providers.map((provider) => ({
              providerId: provider.providerId,
              templateId: provider.templateId,
            })),
          };
        },
        async saveApiKey(providerId, apiKey) {
          const view = await providerSettingsService.getView();
          const provider = view.providers.find((item) => item.providerId === providerId);
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
    if (!persisted) return;
    const preference = buildLoginApiKeyDefaultModelPreferenceFromSelection(
      await modelSelectionService.getView(),
      persisted.providerId,
    );
    markApiKeyLoginSuccess(preference);
  };

  const submitPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await loginMgooleAccount({
        fetchImpl: accountPageFetch,
        email,
        password,
        captcha: {
          turnstileToken: settings.aliyunCaptchaEnabled ? turnstileToken : turnstileToken,
          tencentCaptchaTicket: tencentTicket,
          tencentCaptchaRandstr: tencentRandstr,
        },
      });
      if (result.kind === "rejected") {
        setError(result.message);
        return;
      }
      if (result.kind === "needs_2fa") {
        setTempToken(result.tempToken);
        return;
      }
      writeBrowserAccountSession(result.session);
      setUser(userInfoFromAccountSession(result.session));
      try {
        await applySyncedKey(result.session.accessToken);
      } catch (syncError) {
        logger.warn("[AccountLogin] 同步芒果AI密钥失败", { error: syncError });
      }
      await onLoggedIn();
    } catch (loginError) {
      logger.error("[AccountLogin] 登录失败", { error: loginError });
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setBusy(false);
    }
  };

  const submit2FA = async () => {
    if (!tempToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await completeMgooleLogin2FA({
        fetchImpl: accountPageFetch,
        tempToken,
        totpCode,
      });
      const session = sessionFromLoginResult(result);
      if (!session) {
        setError(result.kind === "rejected" ? result.message : intl.formatMessage({ id: "login.account.2faFailed" }));
        return;
      }
      writeBrowserAccountSession(session);
      setUser(userInfoFromAccountSession(session));
      try {
        await applySyncedKey(session.accessToken);
      } catch (syncError) {
        logger.warn("[AccountLogin] 同步芒果AI密钥失败", { error: syncError });
      }
      await onLoggedIn();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="account-login-form">
      <div className="space-y-2">
        <h2 className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "login.account.title" })}
        </h2>
        {tempToken ? (
          <Input
            type="text"
            inputMode="numeric"
            size="lg"
            className="h-10 w-full text-ui-base"
            data-testid="account-login-2fa"
            aria-label={intl.formatMessage({ id: "login.account.2faLabel" })}
            placeholder={intl.formatMessage({ id: "login.account.2faPlaceholder" })}
            value={totpCode}
            autoComplete="one-time-code"
            onChange={(event) => setTotpCode(event.target.value)}
          />
        ) : (
          <>
            <Input
              type="email"
              size="lg"
              className="h-10 w-full text-ui-base"
              data-testid="account-login-email"
              aria-label={intl.formatMessage({ id: "login.account.email" })}
              placeholder={intl.formatMessage({ id: "login.account.email" })}
              value={email}
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              size="lg"
              className="h-10 w-full text-ui-base"
              data-testid="account-login-password"
              aria-label={intl.formatMessage({ id: "login.account.password" })}
              placeholder={intl.formatMessage({ id: "login.account.password" })}
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
            {settings.turnstileEnabled || settings.aliyunCaptchaEnabled ? (
              <Input
                type="text"
                size="lg"
                className="h-10 w-full text-ui-base"
                data-testid="account-login-captcha"
                aria-label={intl.formatMessage({ id: "login.account.captcha" })}
                placeholder={intl.formatMessage({ id: "login.account.captcha" })}
                value={turnstileToken}
                onChange={(event) => setTurnstileToken(event.target.value)}
              />
            ) : null}
            {settings.tencentCaptchaEnabled ? (
              <>
                <Input
                  type="text"
                  size="lg"
                  className="h-10 w-full text-ui-base"
                  aria-label={intl.formatMessage({ id: "login.account.tencentTicket" })}
                  placeholder={intl.formatMessage({ id: "login.account.tencentTicket" })}
                  value={tencentTicket}
                  onChange={(event) => setTencentTicket(event.target.value)}
                />
                <Input
                  type="text"
                  size="lg"
                  className="h-10 w-full text-ui-base"
                  aria-label={intl.formatMessage({ id: "login.account.tencentRandstr" })}
                  placeholder={intl.formatMessage({ id: "login.account.tencentRandstr" })}
                  value={tencentRandstr}
                  onChange={(event) => setTencentRandstr(event.target.value)}
                />
              </>
            ) : null}
          </>
        )}
      </div>
      {error ? (
        <Alert variant="destructive" data-testid="account-login-error">
          <TriangleAlertIcon className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Button
          type="button"
          className="h-10 w-full text-ui-base"
          size="lg"
          data-testid="account-login-submit"
          disabled={busy || (tempToken ? totpCode.trim().length !== 6 : !email.trim() || !password)}
          onClick={() => void (tempToken ? submit2FA() : submitPassword())}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {intl.formatMessage({
            id: tempToken ? "login.account.confirm2fa" : "login.account.submit",
          })}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-7 w-full text-ui-base text-foreground-subtle hover:text-foreground"
          data-testid="account-login-use-api-key"
          disabled={busy}
          onClick={onUseApiKey}
        >
          {intl.formatMessage({ id: "login.useApiKey" })}
        </Button>
      </div>
    </div>
  );
}
