// Read-only client for the FUDO API (v1alpha1, JSON:API).
//
// Isolates the rest of the backend from API details: 24 h token renewed
// ahead of expiry, pagination without a total count, retries on 429.
// Writes are refused by design: the FUDO accounts we read are production.

export interface JsonApiResource {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    {
      data:
        | { type: string; id: string }
        | { type: string; id: string }[]
        | null;
    }
  >;
}

export interface JsonApiDocument {
  data: JsonApiResource[] | JsonApiResource;
  included?: JsonApiResource[];
}

export interface FudoClientOptions {
  apiKey: string;
  apiSecret: string;
  apiUrl?: string;
  authUrl?: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class FudoError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(`FUDO HTTP ${status}`);
    this.name = 'FudoError';
  }
}

const TOKEN_MARGIN_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const DEFAULT_PAGE_SIZE = 500;

export class FudoClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private readonly apiUrl: string;
  private readonly authUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: FudoClientOptions) {
    this.apiUrl = (options.apiUrl ?? 'https://api.fu.do/v1alpha1').replace(
      /\/$/,
      ''
    );
    this.authUrl = options.authUrl ?? 'https://auth.fu.do/api';
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep =
      options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - TOKEN_MARGIN_MS) {
      return this.token;
    }
    const res = await this.fetchFn(this.authUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: this.options.apiKey,
        apiSecret: this.options.apiSecret,
      }),
    });
    if (!res.ok) {
      throw new FudoError(res.status, await res.text());
    }
    const body = (await res.json()) as { token: string; exp: string };
    this.token = body.token;
    this.tokenExpiresAt = Number(body.exp) * 1000;
    return this.token;
  }

  async request(
    method: 'GET',
    path: string,
    params: Record<string, string> = {}
  ): Promise<JsonApiDocument> {
    if (method !== 'GET') {
      throw new Error('FudoClient is read-only');
    }
    const url = new URL(this.apiUrl + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 1; ; attempt++) {
      const res = await this.fetchFn(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${await this.getToken()}`,
        },
      });
      if (res.ok) {
        return (await res.json()) as JsonApiDocument;
      }
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const seconds = Number(res.headers.get('Retry-After')) || 5;
        await this.sleep(seconds * 1000);
        continue;
      }
      if (res.status === 401 && attempt === 1) {
        this.token = null; // revoked or expired early: get a new one once
        continue;
      }
      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // plain text body (429 answers are plain text)
      }
      throw new FudoError(res.status, body);
    }
  }

  get(path: string, params: Record<string, string> = {}) {
    return this.request('GET', path, params);
  }

  // FUDO does not return a total: keep paging until a short page.
  async getAll(
    path: string,
    {
      params = {},
      pageSize = DEFAULT_PAGE_SIZE,
    }: { params?: Record<string, string>; pageSize?: number } = {}
  ): Promise<{ data: JsonApiResource[]; included: JsonApiResource[] }> {
    const data: JsonApiResource[] = [];
    const included: JsonApiResource[] = [];
    for (let page = 1; ; page++) {
      const doc = await this.get(path, {
        ...params,
        'page[size]': String(pageSize),
        'page[number]': String(page),
      });
      const items = Array.isArray(doc.data) ? doc.data : [doc.data];
      data.push(...items);
      included.push(...(doc.included ?? []));
      if (items.length < pageSize) {
        return { data, included };
      }
    }
  }
}
