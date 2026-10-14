/**
 * Minimal IPFS client wrapper for pinning/retrieving static market metadata
 * (PRD 5.3: "Market parameters are pinned to IPFS and broadcast over Nostr").
 *
 * Talks to any Kubo-RPC-compatible node for writes (`/api/v0/add`) and races
 * multiple public gateways for reads, mitigating single-gateway pinning
 * failure (PRD threat RES-02).
 */

export interface IpfsClientOptions {
  /** Kubo RPC API base URL used for pinning writes, e.g. "http://127.0.0.1:5001". */
  apiUrl?: string;
  /** Read gateways raced in parallel; first successful response wins. */
  gateways?: string[];
}

const DEFAULT_GATEWAYS = ["https://ipfs.io/ipfs", "https://dweb.link/ipfs", "https://cloudflare-ipfs.com/ipfs"];

export class IpfsClient {
  private readonly apiUrl: string;
  private readonly gateways: string[];

  constructor(options: IpfsClientOptions = {}) {
    this.apiUrl = options.apiUrl ?? "http://127.0.0.1:5001";
    this.gateways = options.gateways ?? DEFAULT_GATEWAYS;
  }

  /** Pins a JSON-serializable value and returns its content identifier (CID). */
  async pinJson(value: unknown): Promise<string> {
    const body = new FormData();
    const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
    body.append("file", blob, "metadata.json");

    const response = await fetch(`${this.apiUrl}/api/v0/add?pin=true`, {
      method: "POST",
      body,
    });

    if (!response.ok) {
      throw new Error(`IPFS pin failed: HTTP ${response.status}`);
    }

    const result = (await response.json()) as { Hash: string };
    return result.Hash;
  }

  /** Fetches and parses JSON content for a CID, racing all configured gateways. */
  async fetchJson<T = unknown>(cid: string): Promise<T> {
    const attempts = this.gateways.map((gateway) =>
      fetch(`${gateway}/${cid}`).then((res) => {
        if (!res.ok) throw new Error(`Gateway ${gateway} returned HTTP ${res.status}`);
        return res.json() as Promise<T>;
      }),
    );

    return Promise.any(attempts);
  }
}
