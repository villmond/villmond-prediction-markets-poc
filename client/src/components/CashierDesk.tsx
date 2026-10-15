import { useState } from "react";
import {
  buildCashierOrderEvent,
  encodeGeohash,
  type CashierCurrency,
  type CashierOrderParams,
  type CashierOrderSide,
} from "@villmond/nostr/cashierOrders.js";
import type { VillmondKeypair } from "@villmond/nostr/keypair.js";
import type { Event as NostrEvent } from "nostr-tools";
import { hexToBytes } from "../utils/hex.js";
import { useI18n } from "../context/I18nContext.js";

interface Props {
  orders: CashierOrderParams[];
  supportedCurrencies: CashierCurrency[];
  identity: VillmondKeypair | undefined;
  onPublish: (event: NostrEvent) => void;
}

const SIDE_LABEL_KEYS: Record<CashierOrderSide, string> = {
  sell: "cashierDesk.sideSell",
  buy: "cashierDesk.sideBuy",
};

/** Expert-mode P2P Cashier desk: live quotes plus a form to post your own (PRD 6/6.1). */
export function CashierDesk({ orders, supportedCurrencies, identity, onPublish }: Props) {
  const { t, locale } = useI18n();
  const [side, setSide] = useState<CashierOrderSide>("sell");
  const [currency, setCurrency] = useState<CashierCurrency>(supportedCurrencies[0] ?? "USD");
  const [amount, setAmount] = useState("1000");
  const [price, setPrice] = useState("0.01");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const lat = Number.parseFloat(latitude);
  const lon = Number.parseFloat(longitude);
  const geohash = Number.isFinite(lat) && Number.isFinite(lon) ? encodeGeohash(lat, lon) : undefined;

  const amountVilcoin = Number(amount);
  const pricePerVilcoin = Number(price);
  const amountValid = Number.isFinite(amountVilcoin) && amountVilcoin > 0;
  const priceValid = Number.isFinite(pricePerVilcoin) && pricePerVilcoin > 0;
  const canPost = Boolean(identity) && Boolean(geohash) && amountValid && priceValid;

  function postQuote() {
    if (!identity || !geohash || !amountValid || !priceValid) return;
    const event = buildCashierOrderEvent(
      {
        orderId: `${identity.publicKeyHex}-${Date.now()}`,
        side,
        currency,
        amountVilcoin,
        pricePerVilcoin,
        geohash,
      },
      hexToBytes(identity.secretKeyHex),
    );
    onPublish(event);
  }

  const inputClass =
    "rounded-[10px] border border-vil-line bg-[#100E1A] px-3 py-2.5 text-[13px] text-slate-100 placeholder:text-vil-faint";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-vil-line bg-vil-surface p-4 text-sm">
      <div>
        <h3 className="font-display text-lg font-bold text-slate-100">{t("cashierDesk.title")}</h3>
        <p className="mt-0.5 text-xs text-vil-faint">{t("cashierDesk.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {orders.length === 0 ? (
          <p className="text-xs text-vil-muted">{t("cashierDesk.noQuotes")}</p>
        ) : (
          orders.map((order) => (
            <div
              key={order.orderId}
              className="flex items-center justify-between rounded-[14px] border border-vil-line bg-[#15131F] px-3.5 py-3"
            >
              <div>
                <div className={"mb-0.5 text-[11px] font-bold " + (order.side === "sell" ? "text-vil-yes" : "text-vil-no")}>
                  {t("cashierDesk.orderSummary", {
                    side: t(SIDE_LABEL_KEYS[order.side]),
                    amount: order.amountVilcoin.toLocaleString(locale),
                  })}
                </div>
                <div className="text-xs text-vil-muted">
                  {t("cashierDesk.pricePerVilcoin", { price: order.pricePerVilcoin, currency: order.currency })}
                </div>
              </div>
              <span className="rounded-lg bg-[#100E1A] px-2 py-1 font-mono text-[11px] text-vil-faint">
                {order.geohash}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-vil-line pt-3.5">
        <h4 className="font-display text-[13px] font-bold uppercase tracking-wide text-vil-muted">
          {t("cashierDesk.postAQuote")}
        </h4>

        <div className="grid grid-cols-2 gap-2">
          <select value={side} onChange={(e) => setSide(e.target.value as CashierOrderSide)} className={inputClass}>
            <option value="sell">{t("cashierDesk.sellVilcoin")}</option>
            <option value="buy">{t("cashierDesk.buyVilcoin")}</option>
          </select>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CashierCurrency)}
            className={inputClass}
          >
            {supportedCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("cashierDesk.amountPlaceholder")}
            className={inputClass}
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={t("cashierDesk.pricePlaceholder")}
            className={inputClass}
          />
          <input
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder={t("cashierDesk.latitudePlaceholder")}
            className={inputClass}
          />
          <input
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder={t("cashierDesk.longitudePlaceholder")}
            className={inputClass}
          />
        </div>

        <p className="text-[11px] text-vil-faint">
          {geohash ? (
            <>
              {t("cashierDesk.coarseLocation")} <span className="font-mono text-vil-muted">{geohash}</span>
            </>
          ) : (
            t("cashierDesk.enterLocation")
          )}
        </p>

        <button
          type="button"
          disabled={!canPost}
          onClick={postQuote}
          className="w-full rounded-xl bg-vil-ember py-3 text-sm font-bold text-vil-bg disabled:opacity-50"
        >
          {t("cashierDesk.postQuote")}
        </button>
      </div>
    </section>
  );
}
