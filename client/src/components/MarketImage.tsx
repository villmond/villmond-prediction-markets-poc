import { useEffect, useState } from "react";
import { DEFAULT_GATEWAYS } from "@villmond/nostr/ipfs.js";
import { getCategoryDefaultImage } from "../utils/categoryImages.js";

interface Props {
  imageCid?: string;
  category: string;
  alt: string;
  className?: string;
}

/**
 * Renders a market's custom cover image (if any), racing through IPFS
 * gateways one at a time on load failure, and finally falling back to the
 * bundled local default for that category — so a gateway outage or a bad
 * CID never leaves a card with a broken image (per the fallback behavior
 * requested for this feature).
 */
export function MarketImage({ imageCid, category, alt, className }: Props) {
  const [gatewayIndex, setGatewayIndex] = useState(0);

  useEffect(() => {
    setGatewayIndex(0);
  }, [imageCid]);

  const src =
    imageCid && gatewayIndex < DEFAULT_GATEWAYS.length
      ? `${DEFAULT_GATEWAYS[gatewayIndex]}/${imageCid}`
      : getCategoryDefaultImage(category);

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => {
        if (imageCid && gatewayIndex < DEFAULT_GATEWAYS.length) {
          setGatewayIndex((i) => i + 1);
        }
      }}
    />
  );
}
