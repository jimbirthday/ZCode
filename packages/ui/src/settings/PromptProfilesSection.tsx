import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  PROMPT_PROFILE_FAMILIES,
  draftFromPromptProfile,
  emptyPromptProfileDraft,
  promptProfileFromDraft,
  promptProfileMatchKey,
  upsertPromptProfile,
  validatePromptProfileCatalog,
  type PromptProfile,
  type PromptProfileDraft,
  type PromptProfileScope,
} from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { SettingsGroupCard } from "@/settings/SettingsPageParts.js";

const SCOPES: readonly PromptProfileScope[] = ["default", "family", "provider", "model"];

function errorMessageId(error: string): string {
  if (
    error === "body" ||
    error === "language" ||
    error === "family" ||
    error === "provider" ||
    error === "model" ||
    error === "duplicate-match" ||
    error === "invalid" ||
    error === "invalid-json" ||
    error === "invalid-catalog"
  ) {
    return `settings.promptProfiles.error.${error}`;
  }
  return "settings.promptProfiles.error.load";
}

export function PromptProfilesSection({
  workspaceIdentity,
  workspacePath,
}: {
  workspaceIdentity?: string;
  workspacePath?: string | null;
}) {
  const { intl, locale } = useZCodeIntl();
  const { modelSelectionService, promptProfileService } = useServices();
  const [profiles, setProfiles] = useState<PromptProfile[]>([]);
  const [providers, setProviders] = useState<Array<{ providerId: string; modelIds: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromptProfileDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await promptProfileService.listPromptProfiles();
      setProfiles(next);
    } catch (error) {
      const code = error instanceof Error ? error.message : "load";
      setLoadError(code === "invalid-json" || code === "invalid-catalog" ? code : "load");
      logger.warn("[prompt-profiles] 读取目录失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [promptProfileService]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void modelSelectionService
      .getView()
      .then((view) => {
        if (cancelled) return;
        setProviders(
          view.providers.map((provider) => ({
            providerId: provider.providerId,
            modelIds: provider.models.map((model) => model.modelId),
          })),
        );
      })
      .catch((error: unknown) => {
        logger.warn("[prompt-profiles] 模型列表不可用，改用手工填写", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [modelSelectionService]);

  const persist = useCallback(
    async (next: PromptProfile[]) => {
      const invalid = validatePromptProfileCatalog(next);
      if (invalid) {
        setFormError(errorMessageId(invalid));
        return;
      }
      setSaving(true);
      setFormError(null);
      setStatus(null);
      try {
        const result = await promptProfileService.savePromptProfiles({
          profiles: next,
          ...(workspacePath ? { workspacePath } : {}),
          ...(workspaceIdentity ? { workspaceIdentity } : {}),
        });
        setProfiles(result.profiles);
        setEditingKey(null);
        setDraft(null);
        setStatus(
          result.applyError
            ? "settings.promptProfiles.status.applyFailed"
            : result.appliedToRunningAgents
              ? "settings.promptProfiles.status.applied"
              : "settings.promptProfiles.status.saved",
        );
      } catch (error) {
        const code = error instanceof Error ? error.message : "load";
        setFormError(
          code === "invalid-json" || code === "invalid-catalog" ? errorMessageId(code) : errorMessageId("load"),
        );
      } finally {
        setSaving(false);
      }
    },
    [promptProfileService, workspaceIdentity, workspacePath],
  );

  const selectedModels =
    providers.find((provider) => provider.providerId === draft?.providerId)?.modelIds ?? [];

  return (
    <div className="space-y-4">
      <p className="text-ui-base leading-6 text-foreground-subtle">
        {intl.formatMessage({ id: "settings.promptProfiles.description" })}
      </p>
      {loadError ? (
        <p className="text-ui-base text-destructive">
          {intl.formatMessage({ id: errorMessageId(loadError) })}
        </p>
      ) : null}
      {status ? (
        <p className="text-ui-base text-foreground">{intl.formatMessage({ id: status })}</p>
      ) : null}
      <SettingsGroupCard>
        {loading ? (
          <div className="px-4 py-3 text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: "settings.promptProfiles.loading" })}
          </div>
        ) : profiles.length === 0 ? (
          <div className="px-4 py-3 text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: "settings.promptProfiles.empty" })}
          </div>
        ) : (
          profiles.map((profile) => {
            const key = promptProfileMatchKey(profile);
            return (
              <div
                key={key}
                className="flex flex-col gap-3 border-t border-border px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-ui-base font-medium text-foreground">{profileLabel(profile, intl)}</div>
                  <div className="mt-1 line-clamp-2 text-ui-base text-foreground-subtle">{profile.body}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => {
                      setEditingKey(key);
                      setDraft(draftFromPromptProfile(profile));
                      setFormError(null);
                      setStatus(null);
                    }}
                  >
                    {intl.formatMessage({ id: "settings.promptProfiles.edit" })}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      void persist(profiles.filter((entry) => promptProfileMatchKey(entry) !== key));
                    }}
                  >
                    {intl.formatMessage({ id: "settings.promptProfiles.delete" })}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </SettingsGroupCard>
      {draft ? (
        <SettingsGroupCard>
          <form
            className="space-y-3 px-4 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              const built = promptProfileFromDraft(draft);
              if (!built.ok) {
                setFormError(errorMessageId(built.error));
                return;
              }
              void persist(upsertPromptProfile(profiles, built.profile, editingKey ?? undefined));
            }}
          >
            <Field label={intl.formatMessage({ id: "settings.promptProfiles.scope" })}>
              <Select
                value={draft.scope}
                onValueChange={(scope) =>
                  setDraft({ ...draft, scope: scope as PromptProfileScope })
                }
              >
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {intl.formatMessage({ id: `settings.promptProfiles.scope.${scope}` })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {draft.scope === "family" ? (
              <Field label={intl.formatMessage({ id: "settings.promptProfiles.family" })}>
                <Select value={draft.family} onValueChange={(family) => setDraft({ ...draft, family })}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {familyOptions(draft.family).map((family) => (
                      <SelectItem key={family} value={family}>
                        {family}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {draft.scope === "provider" || draft.scope === "model" ? (
              <Field label={intl.formatMessage({ id: "settings.promptProfiles.provider" })}>
                <Input
                  list="prompt-profile-providers"
                  value={draft.providerId}
                  onChange={(event) => setDraft({ ...draft, providerId: event.target.value })}
                />
                <datalist id="prompt-profile-providers">
                  {providers.map((provider) => (
                    <option key={provider.providerId} value={provider.providerId} />
                  ))}
                </datalist>
              </Field>
            ) : null}
            {draft.scope === "model" ? (
              <Field label={intl.formatMessage({ id: "settings.promptProfiles.model" })}>
                <Input
                  list="prompt-profile-models"
                  value={draft.modelId}
                  onChange={(event) => setDraft({ ...draft, modelId: event.target.value })}
                />
                <datalist id="prompt-profile-models">
                  {selectedModels.map((modelId) => (
                    <option key={modelId} value={modelId} />
                  ))}
                </datalist>
              </Field>
            ) : null}
            <Field label={intl.formatMessage({ id: "settings.promptProfiles.language" })}>
              <Input
                value={draft.language}
                onChange={(event) => setDraft({ ...draft, language: event.target.value })}
              />
            </Field>
            <Field label={intl.formatMessage({ id: "settings.promptProfiles.body" })}>
              <Textarea
                className="min-h-40"
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              />
            </Field>
            {formError ? (
              <p className="text-ui-base text-destructive">{intl.formatMessage({ id: formError })}</p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={saving}>
                {intl.formatMessage({ id: "settings.promptProfiles.save" })}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setDraft(null);
                  setEditingKey(null);
                  setFormError(null);
                }}
              >
                {intl.formatMessage({ id: "settings.promptProfiles.cancel" })}
              </Button>
            </div>
          </form>
        </SettingsGroupCard>
      ) : (
        <Button
          type="button"
          onClick={() => {
            setEditingKey(null);
            setDraft(emptyPromptProfileDraft(locale));
            setFormError(null);
            setStatus(null);
          }}
        >
          {intl.formatMessage({ id: "settings.promptProfiles.add" })}
        </Button>
      )}
    </div>
  );
}

function familyOptions(current: string): string[] {
  return (PROMPT_PROFILE_FAMILIES as readonly string[]).includes(current)
    ? [...PROMPT_PROFILE_FAMILIES]
    : [current, ...PROMPT_PROFILE_FAMILIES];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-ui-base font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function profileLabel(
  profile: PromptProfile,
  intl: { formatMessage: (descriptor: { id: string }) => string },
): string {
  if (profile.providerId && profile.modelId) return `${profile.providerId} / ${profile.modelId}`;
  if (profile.providerId) return profile.providerId;
  if (profile.family) return profile.family;
  if (profile.id === "default") {
    return intl.formatMessage({ id: "settings.promptProfiles.scope.default" });
  }
  return profile.id;
}
