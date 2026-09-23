import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  accountPageFetch,
  listAccountApiKeys,
  modelIdsFromModelsPayload,
  planGroupKeySync,
  readBrowserAccountSession,
  resolveAccountOpenAiBaseUrl,
} from "./mgooleAccount.js";

const SYNCED_PROVIDERS_KEY = "zcode.mgooleAccount.syncedProviders";

function readSyncedProviders(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNCED_PROVIDERS_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function writeSyncedProviders(mapping: Record<string, string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SYNCED_PROVIDERS_KEY, JSON.stringify(mapping));
}

async function modelsForKey(apiKey: string, fallbackModelId: string): Promise<string[]> {
  const baseUrl = resolveAccountOpenAiBaseUrl();
  try {
    const response = await accountPageFetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const payload = (await response.json()) as unknown;
    const ids = modelIdsFromModelsPayload(payload);
    return ids.length > 0 ? ids : [fallbackModelId];
  } catch {
    return [fallbackModelId];
  }
}

export function SyncAccountKeysButton({ onSynced }: { onSynced?: () => void }) {
  const { intl } = useZCodeIntl();
  const { providerSettingsService } = useServices();
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    const session = readBrowserAccountSession();
    if (!session) {
      toast(intl.formatMessage({ id: "settings.modelProvider.syncNeedsLogin" }), { variant: "warning" });
      return;
    }
    setBusy(true);
    try {
      const keys = await listAccountApiKeys({ fetchImpl: accountPageFetch, session });
      const plans = planGroupKeySync(keys);
      if (plans.length === 0) {
        toast(intl.formatMessage({ id: "settings.modelProvider.syncEmpty" }), { variant: "warning" });
        return;
      }
      const previous = readSyncedProviders();
      const view = await providerSettingsService.getView();
      const knownIds = new Set(view.providers.map((provider) => provider.providerId));
      const nextMapping: Record<string, string> = {};
      for (const plan of plans) {
        const existingId = previous[plan.groupKey];
        const providerId = existingId && knownIds.has(existingId)
          ? existingId
          : (
              await providerSettingsService.createPersonalProvider({
                providerName: plan.providerName,
                initialConfig: {
                  access: { type: "api-key", apiKey: plan.apiKey },
                  api: {
                    type: "openai-chat-completions",
                    baseUrl: resolveAccountOpenAiBaseUrl(),
                  },
                },
              })
            ).providerId;
        await providerSettingsService.savePersonalProviderOverlay(
          providerId,
          {
            access: { type: "api-key", apiKey: plan.apiKey },
            api: { type: "openai-chat-completions", baseUrl: resolveAccountOpenAiBaseUrl() },
          },
          { providerName: plan.providerName },
        );
        const current = await providerSettingsService.getView();
        const present = new Set(
          current.providers
            .find((provider) => provider.providerId === providerId)
            ?.models.map((model) => model.modelId) ?? [],
        );
        for (const modelId of await modelsForKey(plan.apiKey, plan.modelId)) {
          if (present.has(modelId)) continue;
          await providerSettingsService.addPersonalModel(providerId, modelId, {}, true);
          present.add(modelId);
        }
        nextMapping[plan.groupKey] = providerId;
        knownIds.add(providerId);
      }
      for (const [groupKey, providerId] of Object.entries(previous)) {
        if (nextMapping[groupKey] || !knownIds.has(providerId)) continue;
        await providerSettingsService.deletePersonalProvider(providerId);
      }
      writeSyncedProviders(nextMapping);
      toast(intl.formatMessage({ id: "settings.modelProvider.syncDone" }, { count: plans.length }));
      onSynced?.();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), { variant: "warning" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      disabled={busy}
      data-testid="sync-account-keys"
      onClick={() => void sync()}
    >
      {intl.formatMessage({
        id: busy ? "settings.modelProvider.syncing" : "settings.modelProvider.syncKeys",
      })}
    </Button>
  );
}
