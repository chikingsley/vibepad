import { hostCredentialStore } from "@/features/connections/host-credential-store";

type HostWriteMethod = "DELETE" | "PATCH" | "POST";

const readResponse = async (response: Response): Promise<unknown> => {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `VibePad host ${response.status}: ${message || response.statusText}`
    );
  }
  return response.json() as Promise<unknown>;
};

export class VibePadHostTransport {
  readonly #baseUrl: string;
  readonly #hostId: string;

  constructor(baseUrl: string, hostId: string) {
    this.#baseUrl = baseUrl;
    this.#hostId = hostId;
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  get hostId() {
    return this.#hostId;
  }

  async authorizationHeaders(): Promise<Headers> {
    const headers = new Headers();
    const credential = await hostCredentialStore.read(this.#hostId);
    if (credential?.kind === "bearer") {
      headers.set("Authorization", `Bearer ${credential.token}`);
    }
    return headers;
  }

  async get(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(
      `${this.#baseUrl}${path}`,
      signal
        ? { headers: await this.authorizationHeaders(), signal }
        : { headers: await this.authorizationHeaders() }
    );
    return readResponse(response);
  }

  post(path: string, body: unknown): Promise<unknown> {
    return this.write("POST", path, body);
  }

  async write(
    method: HostWriteMethod,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const headers = await this.authorizationHeaders();
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${this.#baseUrl}${path}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers,
      method,
    });
    return readResponse(response);
  }
}
