import { finalizeEvent, type EventTemplate, type Event as NostrEvent } from "nostr-tools";

/**
 * Standard NIP-01 profile metadata (kind 0, "set_metadata") — the one place
 * this app intentionally follows the wider Nostr ecosystem's convention
 * instead of a custom kind, so a user's profile is visible in other Nostr
 * clients too. Relays treat kind 0 as replaceable per-pubkey (NIP-01), so
 * the latest event IS the current profile — no client-side aggregation
 * needed, unlike market/bet events.
 */
export const PROFILE_METADATA_KIND = 0;

export interface ProfileMetadataParams {
  name?: string;
  about?: string;
  /** Avatar URL. Restricted to http(s) — this gets rendered as an <img src>, so other schemes are rejected rather than silently accepted. */
  picture?: string;
}

export interface ProfileMetadata extends ProfileMetadataParams {
  updatedAt: number;
}

function validatePicture(picture: string | undefined): string | undefined {
  const trimmed = picture?.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("picture must be an http(s) URL");
  }
  return trimmed;
}

/** Builds and signs a kind:0 profile metadata event. */
export function buildProfileMetadataEvent(params: ProfileMetadataParams, secretKey: Uint8Array): NostrEvent {
  const name = params.name?.trim();
  const about = params.about?.trim();
  const picture = validatePicture(params.picture);

  if (name && name.length > 64) {
    throw new Error("name must be 64 characters or fewer");
  }
  if (about && about.length > 280) {
    throw new Error("about must be 280 characters or fewer");
  }

  const content: Record<string, string> = {};
  if (name) content.name = name;
  if (about) content.about = about;
  if (picture) content.picture = picture;

  const template: EventTemplate = {
    kind: PROFILE_METADATA_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(content),
  };

  return finalizeEvent(template, secretKey);
}

/** Extracts profile metadata back out of a signed kind:0 event. */
export function parseProfileMetadataEvent(event: NostrEvent): ProfileMetadata {
  if (event.kind !== PROFILE_METADATA_KIND) {
    throw new Error(`Expected kind ${PROFILE_METADATA_KIND}, got ${event.kind}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(event.content) as Record<string, unknown>;
  } catch {
    throw new Error("Profile metadata event has malformed JSON content");
  }

  return {
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    about: typeof parsed.about === "string" ? parsed.about : undefined,
    picture: typeof parsed.picture === "string" ? parsed.picture : undefined,
    updatedAt: event.created_at,
  };
}
