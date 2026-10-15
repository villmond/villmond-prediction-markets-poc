import { useEffect, useMemo, useState } from "react";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import type { CashierOrderParams } from "@villmond/nostr/cashierOrders.js";

/** Subscribes to live P2P Cashier liquidity quotes over a shared relay client (PRD 6.1). */
export function useCashierOrders(client: MarketRelayClient | null): CashierOrderParams[] {
  const [orders, setOrders] = useState<Map<string, CashierOrderParams>>(new Map());

  useEffect(() => {
    if (!client) return;

    setOrders(new Map());

    const sub = client.subscribeToCashierOrders(
      (order) => {
        setOrders((prev) => new Map(prev).set(order.orderId, order));
      },
      undefined,
      (orderId) => {
        setOrders((prev) => {
          if (!prev.has(orderId)) return prev;
          const next = new Map(prev);
          next.delete(orderId);
          return next;
        });
      },
    );

    return () => sub.close();
  }, [client]);

  return useMemo(() => [...orders.values()], [orders]);
}
