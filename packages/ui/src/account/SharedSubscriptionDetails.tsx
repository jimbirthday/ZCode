import type { ReactNode } from "react";
import { Progress } from "@/components/ui/progress.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import {
  formatSharedAmount,
  formatSharedPrice,
  formatSharedDateTime,
  limitedSharedWindows,
  remainingSharedDays,
  sharedPlanLimit,
  sharedWindowUsagePercent,
  type SharedPlanOffer,
  type SharedQuotaKind,
  type SharedQuotaWindow,
} from "./mgooleAccount.js";
import { useAccountFooterSnapshot } from "./sharedSubscriptionPresence.js";

const QUOTA_KINDS: SharedQuotaKind[] = ["daily", "weekly", "monthly"];

function quotaLabelId(kind: SharedQuotaKind): string {
  return `settings.subscription.quota.${kind}`;
}

function statusLabel(status: string, formatMessage: (descriptor: { id: string }) => string): string {
  if (status === "active" || status === "paused" || status === "expired" || status === "revoked") {
    return formatMessage({ id: `settings.subscription.status.${status}` });
  }
  return status;
}

function MetaTile({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-lg bg-surface px-3 py-2.5">
      <div className="text-ui-xs text-foreground-subtle">{label}</div>
      <div className="mt-1 text-ui-base font-medium text-foreground">{value}</div>
    </div>
  );
}

function GroupChips({ names }: { names: readonly string[] }) {
  const { intl } = useZCodeIntl();
  if (names.length === 0) return null;
  return (
    <div>
      <div className="text-ui-xs text-foreground-subtle">
        {intl.formatMessage({ id: "settings.subscription.groupsLabel" })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {names.map((name, index) => (
          <span
            key={`${name}-${index}`}
            className="max-w-full rounded-md bg-surface px-2 py-1 text-ui-xs break-words text-foreground"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SharedQuotaGrid({ windows }: { windows: readonly SharedQuotaWindow[] }) {
  const { intl, locale } = useZCodeIntl();
  if (windows.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {windows.map((window) => {
        const limited = window.limit !== null && window.limit > 0;
        const resets = formatSharedDateTime(window.resetsAt, locale);
        return (
          <div key={window.kind} className="rounded-lg bg-surface px-3 py-2.5">
            <div className="text-ui-xs text-foreground-subtle">
              {intl.formatMessage({ id: quotaLabelId(window.kind) })}
            </div>
            <div className="mt-1 text-ui-base font-medium tabular-nums text-foreground">
              {limited
                ? intl.formatMessage(
                    { id: "settings.subscription.usedOf" },
                    {
                      used: formatSharedAmount(window.used),
                      limit: formatSharedAmount(window.limit ?? 0),
                    },
                  )
                : intl.formatMessage({ id: "settings.subscription.unlimited" })}
            </div>
            {limited ? (
              <Progress
                className="mt-2 h-1.5"
                value={sharedWindowUsagePercent(window)}
                aria-label={intl.formatMessage({ id: quotaLabelId(window.kind) })}
              />
            ) : (
              <div className="mt-1 text-ui-xs text-foreground-subtle">
                {intl.formatMessage(
                  { id: "settings.subscription.usedOnly" },
                  { used: formatSharedAmount(window.used) },
                )}
              </div>
            )}
            {resets ? (
              <div className="mt-1.5 text-ui-xs text-foreground-subtle">
                {intl.formatMessage({ id: "settings.subscription.resetsAt" }, { time: resets })}
              </div>
            ) : null}
            {window.reserved > 0 ? (
              <div className="mt-1 text-ui-xs text-foreground-subtle">
                {intl.formatMessage(
                  { id: "settings.subscription.reserved" },
                  { amount: formatSharedAmount(window.reserved) },
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function SharedQuotaBars({
  windows,
  compact = false,
}: {
  windows: readonly SharedQuotaWindow[];
  compact?: boolean;
}) {
  const { intl, locale } = useZCodeIntl();
  const visible = compact ? limitedSharedWindows(windows) : windows;
  if (visible.length === 0) return null;
  return (
    <div className={compact ? "space-y-1.5" : "mt-3 space-y-3"}>
      {visible.map((window) => {
        const limited = window.limit !== null && window.limit > 0;
        const resets = formatSharedDateTime(window.resetsAt, locale);
        return (
          <div key={window.kind}>
            <div className="flex items-center justify-between gap-2 text-ui-xs text-foreground-subtle">
              <span>{intl.formatMessage({ id: quotaLabelId(window.kind) })}</span>
              <span className="tabular-nums">
                {limited
                  ? intl.formatMessage(
                      { id: "settings.subscription.usedOf" },
                      {
                        used: formatSharedAmount(window.used),
                        limit: formatSharedAmount(window.limit ?? 0),
                      },
                    )
                  : intl.formatMessage(
                      { id: "settings.subscription.usedOnly" },
                      { used: formatSharedAmount(window.used) },
                    )}
              </span>
            </div>
            {limited ? (
              <Progress
                className="mt-1 h-1.5"
                value={sharedWindowUsagePercent(window)}
                aria-label={intl.formatMessage({ id: quotaLabelId(window.kind) })}
              />
            ) : (
              <div className="mt-1 text-ui-xs text-foreground-subtle">
                {intl.formatMessage({ id: "settings.subscription.unlimited" })}
              </div>
            )}
            {!compact && resets ? (
              <div className="mt-1 text-ui-xs text-foreground-subtle">
                {intl.formatMessage({ id: "settings.subscription.resetsAt" }, { time: resets })}
                {window.reserved > 0
                  ? ` · ${intl.formatMessage(
                      { id: "settings.subscription.reserved" },
                      { amount: formatSharedAmount(window.reserved) },
                    )}`
                  : ""}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function SharedPlanCard({
  plan,
  action,
}: {
  plan: SharedPlanOffer;
  action: ReactNode;
}) {
  const { intl } = useZCodeIntl();
  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-ui-base font-semibold text-foreground">{plan.name}</h3>
          {plan.description ? (
            <p className="mt-1 line-clamp-2 text-ui-base leading-6 text-foreground-subtle">
              {plan.description}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold tabular-nums text-foreground">
            {formatSharedPrice(plan.price)}
          </div>
          <div className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage(
              { id: "settings.subscription.dayCount" },
              { days: plan.validityDays },
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {QUOTA_KINDS.map((kind) => {
          const limit = sharedPlanLimit(plan, kind);
          return (
            <div key={kind} className="rounded-lg bg-surface px-2 py-2 text-center">
              <div className="text-ui-xs text-foreground-subtle">
                {intl.formatMessage({ id: quotaLabelId(kind) })}
              </div>
              <div className="mt-1 text-ui-base font-medium tabular-nums text-foreground">
                {limit === null
                  ? intl.formatMessage({ id: "settings.subscription.unlimited" })
                  : formatSharedAmount(limit)}
              </div>
            </div>
          );
        })}
      </div>
      {plan.groupNames.length > 0 ? (
        <div className="mt-4">
          <GroupChips names={plan.groupNames} />
        </div>
      ) : null}
      <div className="mt-auto flex justify-end pt-4">{action}</div>
    </article>
  );
}

export function SharedEntitlementCard({
  name,
  description,
  status,
  startsAt,
  expiresAt,
  price,
  validityDays,
  groupNames,
  windows,
  action,
}: {
  name: string;
  description: string;
  status: string;
  startsAt: string;
  expiresAt: string;
  price: number;
  validityDays: number;
  groupNames: readonly string[];
  windows: readonly SharedQuotaWindow[];
  action: ReactNode;
}) {
  const { intl, locale } = useZCodeIntl();
  const remaining = remainingSharedDays(expiresAt);
  const expires = formatSharedDateTime(expiresAt, locale);
  const starts = formatSharedDateTime(startsAt, locale);
  const remainingValue =
    remaining === null
      ? ""
      : remaining === 0
        ? intl.formatMessage({ id: "settings.subscription.expiresToday" })
        : intl.formatMessage({ id: "settings.subscription.dayCount" }, { days: remaining });
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-ui-base font-semibold text-foreground">{name}</h3>
            <span className="rounded-md bg-surface px-2 py-0.5 text-ui-xs font-medium text-foreground-subtle">
              {statusLabel(status, intl.formatMessage)}
            </span>
          </div>
          {description ? (
            <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">{description}</p>
          ) : null}
          {starts ? (
            <p className="mt-1 text-ui-xs text-foreground-subtle">
              {intl.formatMessage({ id: "settings.subscription.startsAt" }, { time: starts })}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetaTile
          label={intl.formatMessage({ id: "settings.subscription.remaining" })}
          value={remainingValue}
        />
        <MetaTile
          label={intl.formatMessage({ id: "settings.subscription.expiresLabel" })}
          value={expires}
        />
        <MetaTile
          label={intl.formatMessage({ id: "settings.subscription.price" })}
          value={formatSharedPrice(price)}
        />
        <MetaTile
          label={intl.formatMessage({ id: "settings.subscription.validity" })}
          value={intl.formatMessage({ id: "settings.subscription.dayCount" }, { days: validityDays })}
        />
      </div>
      {groupNames.length > 0 ? (
        <div className="mt-4">
          <GroupChips names={groupNames} />
        </div>
      ) : null}
      {windows.length > 0 ? (
        <div className="mt-4">
          <SharedQuotaGrid windows={windows} />
        </div>
      ) : null}
    </article>
  );
}

export function AccountFooterSummary({
  settingsButtonMode,
  onOpenSettings,
}: {
  settingsButtonMode?: "settings" | "back";
  onOpenSettings?: () => void;
}) {
  const { intl } = useZCodeIntl();
  const snapshot = useAccountFooterSnapshot();
  if (snapshot.balance === null) return null;

  const openSection = (section: "account" | "subscription") => {
    setPendingSettingsSectionIntent(section);
    if (settingsButtonMode !== "back") onOpenSettings?.();
  };

  return (
    <div className="space-y-2" data-testid="account-footer-summary">
      <FooterSummaryButton onClick={() => openSection("account")}>
        <span className="flex items-center justify-between gap-2">
          <span className="text-foreground-subtle">
            {intl.formatMessage({ id: "settings.account.balance" })}
          </span>
          <span className="font-medium tabular-nums text-foreground">
            {formatSharedPrice(snapshot.balance)}
          </span>
        </span>
      </FooterSummaryButton>
      {snapshot.entitlements.map((item) => {
        const remaining = remainingSharedDays(item.expiresAt);
        return (
          <FooterSummaryButton key={item.id} onClick={() => openSection("subscription")}>
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate font-medium text-foreground">{item.name}</span>
              <span className="shrink-0 text-ui-xs text-foreground-subtle">
                {remaining === null
                  ? ""
                  : remaining === 0
                    ? intl.formatMessage({ id: "settings.subscription.expiresToday" })
                    : intl.formatMessage(
                        { id: "settings.subscription.remainingDays" },
                        { days: remaining },
                      )}
              </span>
            </span>
            <SharedQuotaBars windows={item.windows} compact />
          </FooterSummaryButton>
        );
      })}
    </div>
  );
}

function FooterSummaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-1 rounded-lg px-1 py-1 text-left text-ui-base hover:bg-surface"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
