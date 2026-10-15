import { useEffect, useState } from "react";
import type { VillmondConfig } from "@villmond/nostr/config.js";
import type { CashierCurrency } from "@villmond/nostr/cashierOrders.js";
import { ModeProvider, useMode } from "./context/ModeContext.js";
import { I18nProvider, useI18n } from "./context/I18nContext.js";
import { ToastProvider, useToast } from "./context/ToastContext.js";
import { ToastHost } from "./components/ToastHost.js";
import { useIdentity } from "./hooks/useIdentity.js";
import { useRelayStatus } from "./hooks/useRelayStatus.js";
import { useRelayClient, publishEvent } from "./hooks/useRelayClient.js";
import { useMarketEvents } from "./hooks/useMarketEvents.js";
import { useCashierOrders } from "./hooks/useCashierOrders.js";
import { loadClientConfig } from "./utils/config.js";
import { Logo } from "./components/Logo.js";
import { BottomNav } from "./components/BottomNav.js";
import { SplashScreen } from "./components/SplashScreen.js";
import { IdentityBackupBanner } from "./components/IdentityBackupBanner.js";
import { OnboardingWizard } from "./components/OnboardingWizard.js";
import { MarketList } from "./components/MarketList.js";
import { ExpertPanel } from "./components/ExpertPanel.js";
import { CashierDesk } from "./components/CashierDesk.js";
import { OracleReputationPanel } from "./components/OracleReputationPanel.js";
import { RoleBadges } from "./components/RoleBadges.js";
import { MinaWalletPanel } from "./components/MinaWalletPanel.js";
import { ResolveMarketPanel } from "./components/ResolveMarketPanel.js";
import { CashierEscrowPanel } from "./components/CashierEscrowPanel.js";
import { ProfileTab } from "./components/ProfileTab.js";
import { BalanceTab } from "./components/BalanceTab.js";
import { detectRoles, isViewAllowed } from "./utils/roles.js";
import { useMinaWallet } from "./hooks/useMinaWallet.js";

function AppShell({ config }: { config: VillmondConfig }) {
  const { view, setView } = useMode();
  const { t } = useI18n();
  const toast = useToast();
  const { identity, isFreshIdentity, loading } = useIdentity();
  const minaWallet = useMinaWallet();
  const cashierEnabled = config.economy.enable_cashier_network;

  const relayClient = useRelayClient(config.network.default_relays);
  const relayStatus = useRelayStatus(relayClient);
  const { markets, rawEvents } = useMarketEvents(relayClient);
  const orders = useCashierOrders(cashierEnabled ? relayClient : null);

  const publish = (event: Parameters<typeof publishEvent>[1]): void => {
    void publishEvent(relayClient, event);
  };

  const avatarLabel = identity ? identity.npub.slice(5, 7).toUpperCase() : "··";
  const roles = detectRoles(identity, {
    adminPublicKey: config.economy.admin_public_key,
    oraclePublicKeys: config.oracles.designated_public_keys ?? [],
    cashierPublicKeys: config.cashier_module.designated_public_keys ?? [],
  });
  const rolesKey = roles.join(",");

  useEffect(() => {
    document.title = config.app.name;
  }, [config.app.name]);

  // Bounce back to Markets if the active tab is no longer allowed — e.g. a
  // stale localStorage value from a previous role/config, or identity still
  // loading (roles are empty until it resolves). Waits for loading to
  // finish so a legitimate admin isn't flashed out of Expert on reload.
  useEffect(() => {
    if (loading) return;
    if (!isViewAllowed(view, roles, cashierEnabled)) {
      setView("markets");
    }
    // rolesKey is a stable, comparable form of `roles` (a fresh array every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rolesKey, cashierEnabled, loading, setView]);

  // config.yaml is only fetched once and cached (see utils/config.ts) — an
  // admin editing it live per ADMINISTRATION.md's "no rebuild needed"
  // workflow gets no signal that a reload is actually needed. Poll the raw
  // text and offer one when it changes.
  useEffect(() => {
    let cancelled = false;
    let lastText: string | null = null;

    const checkForChange = () => {
      fetch("/config.yaml")
        .then((res) => res.text())
        .then((text) => {
          if (cancelled) return;
          if (lastText === null) {
            lastText = text;
            return;
          }
          if (text !== lastText) {
            lastText = text;
            toast.push({
              message: t("config.changed"),
              tone: "info",
              action: { label: t("config.reload"), onClick: () => window.location.reload() },
            });
          }
        })
        .catch(() => {
          // Transient network hiccup; just try again on the next poll.
        });
    };

    checkForChange();
    const interval = setInterval(checkForChange, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Depends on `t` so the toast is never built from a stale pre-dictionary-load
    // closure. `toast.push` is intentionally omitted: ToastContext memoizes it via
    // useCallback with a stable dependency, so its identity never actually changes
    // even though the context value object is a fresh literal every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const minaWalletPanelProps = {
    wallet: minaWallet.wallet,
    loading: minaWallet.loading,
    faucetStatus: minaWallet.faucetStatus,
    faucetError: minaWallet.faucetError,
    onRequestFaucet: () => void minaWallet.requestFaucetFunds(),
    onImportKey: minaWallet.importMinaKey,
  };

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-vil-bg">
      {view === "markets" && <OnboardingWizard />}

      <header className="flex items-center justify-between border-b border-vil-line px-[18px] pb-3.5 pt-5">
        <Logo name={config.app.name} />
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-vil-surface-raised font-display text-xs font-bold text-[#D8CCFF]">
          {avatarLabel}
        </div>
      </header>

      <RoleBadges roles={roles} />

      <main className="flex-1 overflow-y-auto">
        {!loading && isFreshIdentity && identity && <IdentityBackupBanner identity={identity} />}

        {view === "markets" && (
          <MarketList
            markets={markets}
            identity={identity}
            minaWallet={minaWallet.wallet}
            categories={config.markets.categories}
            onPublish={publish}
          />
        )}

        {view === "balance" && (
          <BalanceTab
            identity={identity}
            relayClient={relayClient}
            minaWallet={minaWallet.wallet}
            tokenName={config.economy.token_name}
            startingBalance={config.economy.initial_user_balance}
          />
        )}

        {view === "oracle" && (
          <>
            <div className="mx-4 mt-4">
              <MinaWalletPanel {...minaWalletPanelProps} />
            </div>
            <div className="mx-4 mt-3">
              <OracleReputationPanel
                relays={config.network.default_relays}
                identity={identity}
                minReputationThreshold={config.oracles.min_reputation_threshold}
                onPublish={publish}
              />
            </div>
            <div className="mx-4 mt-3 mb-4">
              <ResolveMarketPanel
                markets={markets}
                minaWallet={minaWallet.wallet}
                identity={identity}
                relayClient={relayClient}
                onPublish={publish}
              />
            </div>
          </>
        )}

        {view === "cashier" && cashierEnabled && (
          <>
            <div className="mx-4 mt-4">
              <MinaWalletPanel {...minaWalletPanelProps} />
            </div>
            <div className="mx-4 mt-3">
              <CashierDesk
                orders={orders}
                supportedCurrencies={config.cashier_module.supported_currencies as CashierCurrency[]}
                identity={identity}
                onPublish={publish}
              />
            </div>
            <div className="mx-4 mt-3 mb-4">
              <CashierEscrowPanel minaWallet={minaWallet.wallet} />
            </div>
          </>
        )}

        {view === "expert" && (
          <>
            <ExpertPanel relays={config.network.default_relays} rawEvents={rawEvents} relayStatus={relayStatus} />
            <div className="mx-4 mt-3 mb-4">
              <MinaWalletPanel {...minaWalletPanelProps} />
            </div>
          </>
        )}

        {view === "profile" && (
          <ProfileTab
            identity={identity}
            minaAddress={minaWallet.wallet?.address}
            relayClient={relayClient}
            onPublish={publish}
          />
        )}
      </main>

      <BottomNav roles={roles} cashierEnabled={cashierEnabled} />
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState<VillmondConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClientConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <I18nProvider>
      <ToastProvider>
        <ToastHost />
        {error ? (
          <SplashScreen error={error} />
        ) : !config ? (
          <SplashScreen />
        ) : (
          <ModeProvider>
            <AppShell config={config} />
          </ModeProvider>
        )}
      </ToastProvider>
    </I18nProvider>
  );
}
