import { describe, expect, it } from "vitest";
import { generateKeypair, importFromNsec } from "../src/keypair.js";

describe("generateKeypair", () => {
  it("generates a well-formed keypair with matching nsec/npub encodings", () => {
    const keypair = generateKeypair();

    expect(keypair.secretKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(keypair.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(keypair.nsec).toMatch(/^nsec1/);
    expect(keypair.npub).toMatch(/^npub1/);
  });

  it("generates distinct keypairs on each call", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.secretKeyHex).not.toBe(b.secretKeyHex);
  });
});

describe("importFromNsec", () => {
  it("round-trips a generated keypair through its exported nsec", () => {
    const original = generateKeypair();
    const imported = importFromNsec(original.nsec);

    expect(imported.secretKeyHex).toBe(original.secretKeyHex);
    expect(imported.publicKeyHex).toBe(original.publicKeyHex);
    expect(imported.npub).toBe(original.npub);
  });

  it("rejects a non-nsec bech32 string", () => {
    const { npub } = generateKeypair();
    expect(() => importFromNsec(npub)).toThrow();
  });
});
