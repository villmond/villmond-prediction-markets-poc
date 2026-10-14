import { afterEach, describe, expect, it, vi } from "vitest";
import { IpfsClient } from "../src/ipfs.js";

describe("IpfsClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pins JSON via the Kubo RPC API and returns the CID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Hash: "bafyTestCid" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new IpfsClient({ apiUrl: "http://localhost:5001" });
    const cid = await client.pinJson({ question: "test" });

    expect(cid).toBe("bafyTestCid");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5001/api/v0/add?pin=true",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when the pin API responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const client = new IpfsClient();
    await expect(client.pinJson({})).rejects.toThrow(/500/);
  });

  it("races configured gateways and returns the first successful JSON response", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("https://slow.example")) {
        return new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => ({ slow: true }) }), 50),
        );
      }
      return Promise.resolve({ ok: true, json: async () => ({ fast: true }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new IpfsClient({
      gateways: ["https://slow.example/ipfs", "https://fast.example/ipfs"],
    });

    await expect(client.fetchJson("bafyTestCid")).resolves.toEqual({ fast: true });
  });
});
