const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const ALLOWED = new Set(['getGenesisHash', 'getTransaction']);

export class ReadRpc {
  constructor(endpoint, fetcher = fetch) {
    let url;
    try { url = new URL(endpoint); } catch { throw new TypeError('invalid RPC URL'); }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new TypeError('RPC requires HTTPS or local loopback HTTP');
    }
    if (url.username || url.password || url.hash) throw new TypeError('RPC URL cannot contain basic auth or a fragment');
    this.endpoint = url;
    this.fetcher = fetcher;
  }

  async call(method, params = []) {
    if (!ALLOWED.has(method)) throw new TypeError('collector RPC is read-only');
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!response.ok || Number(response.headers.get('content-length')) > 2_000_000) throw Error();
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2_000_000) { await reader.cancel(); throw Error(); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (body?.jsonrpc !== '2.0' || body.id !== 1 || 'error' in body || !('result' in body)) throw Error();
      return body.result;
    } catch {
      // Provider URLs can contain API keys. Never include them in errors or logs.
      throw new Error('RPC response unavailable or unusable');
    }
  }

  async verifyMainnet() {
    if (await this.call('getGenesisHash') !== MAINNET_GENESIS) throw new Error('RPC is not Solana mainnet');
  }
}
