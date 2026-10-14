import { useEffect, useState } from "react";
import type { VillmondConfig } from "@villmond/nostr/config.js";
import type { CashierCurrency } from "@villmond/nostr/cashierOrders.js";
import { ModeProvider, useMode } from "./context/ModeContext.js";
import { useIdentity } from "./hooks/useIdentity.js";
import { useRelayClient, publishEvent } from "./hooks/useRelayClient.js";
import { useMarketEvents } from "./hooks/useMarketEvents.js";
import { useCashierOrders } from "./hooks/useCashierOrders.js";
import { loadClientConfig } from "./utils/config.js";
import { Logo } from "./components/Logo.js";
import { BottomNav } from "./components/BottomNav.js";
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
import { detectRoles } from "./utils/roles.js";
import { useMinaWallet } from "./hooks/useMinaWallet.js";

function AppShell({ config }: { config: VillmondConfig }) {
  const { mode } = useMode();
  const { identity, isFreshIdentity, loading } = useIdentity();
  const minaWallet = useMinaWallet();
  const cashierEnabled = config.economy.enable_cashier_network;

  const relayClient = useRelayClient(config.network.default_relays);
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

  useEffect(() => {
    document.title = config.app.name;
  }, [config.app.name]);

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-vil-bg">
      {mode === "newbie" && <OnboardingWizard />}

      <header className="flex items-center justify-between border-b border-vil-line px-[18px] pb-3.5 pt-5">
        <Logo name={config.app.name} />
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-vil-surface-raised font-display text-xs font-bold text-[#D8CCFF]">
          {avatarLabel}
        </div>
      </header>

      <RoleBadges roles={roles} />

      <main className="flex-1 overflow-y-auto">
        {!loading && isFreshIdentity && identity && <IdentityBackupBanner identity={identity} />}

        {mode === "newbie" ? (
          <MarketList markets={markets} identity={identity} minaWallet={minaWallet.wallet} onPublish={publish} />
        ) : (
          <>
            <ExpertPanel relays={config.network.default_relays} rawEvents={rawEvents} identity={identity} />
            <div className="mx-4 mt-3">
              <MinaWalletPanel
                wallet={minaWallet.wallet}
                loading={minaWallet.loading}
                faucetStatus={minaWallet.faucetStatus}
                faucetError={minaWallet.faucetError}
                onRequestFaucet={() => void minaWallet.requestFaucetFunds()}
              />
            </div>
            <div className="mx-4 mt-3">
              <OracleReputationPanel
                relays={config.network.default_relays}
                identity={identity}
                minReputationThreshold={config.oracles.min_reputation_threshold}
                onPublish={publish}
              />
            </div>
            <div className="mx-4 mt-3">
              <ResolveMarketPanel markets={markets} minaWallet={minaWallet.wallet} />
            </div>
            {cashierEnabled && (
              <>
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
          </>
        )}
      </main>

      <BottomNav />
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

  if (error) {
    return <p className="bg-vil-bg p-4 text-sm text-vil-no">Failed to load configuration: {error}</p>;
  }

  if (!config) {
    return <p className="bg-vil-bg p-4 text-sm text-vil-muted">Loading…</p>;
  }

  return (
    <ModeProvider>
      <AppShell config={config} />
    </ModeProvider>
  );
}
