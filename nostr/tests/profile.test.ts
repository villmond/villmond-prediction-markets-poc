import { describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools";
import { PROFILE_METADATA_KIND, buildProfileMetadataEvent, parseProfileMetadataEvent } from "../src/profile.js";

describe("profile metadata events", () => {
  it("builds a signed kind:0 event round-tripping name/about/picture", () => {
    const secretKey = generateSecretKey();

    const event = buildProfileMetadataEvent(
      { name: "Ada", about: "Oracle operator", picture: "https://example.com/avatar.png" },
      secretKey,
    );

    expect(event.kind).toBe(PROFILE_METADATA_KIND);
    const parsed = parseProfileMetadataEvent(event);
    expect(parsed).toMatchObject({
      name: "Ada",
      about: "Oracle operator",
      picture: "https://example.com/avatar.png",
    });
  });

  it("omits fields that weren't set", () => {
    const secretKey = generateSecretKey();
    const event = buildProfileMetadataEvent({ name: "Ada" }, secretKey);
    const parsed = parseProfileMetadataEvent(event);
    expect(parsed.name).toBe("Ada");
    expect(parsed.about).toBeUndefined();
    expect(parsed.picture).toBeUndefined();
  });

  it("rejects a non-http(s) picture URL", () => {
    const secretKey = generateSecretKey();
    expect(() => buildProfileMetadataEvent({ picture: "javascript:alert(1)" }, secretKey)).toThrow(/http/);
  });

  it("rejects a name over 64 characters", () => {
    const secretKey = generateSecretKey();
    expect(() => buildProfileMetadataEvent({ name: "a".repeat(65) }, secretKey)).toThrow(/64/);
  });

  it("rejects an about over 280 characters", () => {
    const secretKey = generateSecretKey();
    expect(() => buildProfileMetadataEvent({ about: "a".repeat(281) }, secretKey)).toThrow(/280/);
  });

  it("rejects a wrong-kind event when parsing", () => {
    const secretKey = generateSecretKey();
    const event = buildProfileMetadataEvent({ name: "Ada" }, secretKey);
    expect(() => parseProfileMetadataEvent({ ...event, kind: 1 })).toThrow(/Expected kind/);
  });
});
