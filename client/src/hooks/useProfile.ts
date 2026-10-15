import { useEffect, useState } from "react";
import type { MarketRelayClient } from "@villmond/nostr/relayPool.js";
import type { ProfileMetadata } from "@villmond/nostr/profile.js";

/** Subscribes to the current identity's own kind:0 profile metadata (Profile tab). */
export function useProfile(
  client: MarketRelayClient | null,
  publicKeyHex: string | undefined,
): ProfileMetadata | undefined {
  const [profile, setProfile] = useState<ProfileMetadata | undefined>(undefined);

  useEffect(() => {
    setProfile(undefined);
    if (!client || !publicKeyHex) return;

    const sub = client.subscribeToProfile(publicKeyHex, (next) => {
      setProfile((prev) => (!prev || next.updatedAt >= prev.updatedAt ? next : prev));
    });

    return () => sub.close();
  }, [client, publicKeyHex]);

  return profile;
}
