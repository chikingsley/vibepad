import {
  attestKeyAsync,
  generateAssertionAsync,
  generateKeyAsync,
  isSupported as isAppAttestSupported,
} from "@expo/app-integrity";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

import { getClientInstallationMetadata } from "@/features/connections/client-installation-profile";

import {
  getSecureDpopSigner,
  type SecureDpopSigner,
} from "./secure-dpop-signer";

export type HostedVoiceEnvironment = "lab" | "production";

export interface HostedVoiceToken {
  readonly credentialId: string;
  readonly environment: HostedVoiceEnvironment;
  readonly expiresAt: string;
  readonly key: string;
  readonly keyPrefix: string;
  readonly scopes: readonly string[];
}

interface AppAttestRegistration {
  readonly appAttestKeyId: string;
  readonly dpopJkt: string;
  readonly installationId: string;
}

interface AppAttestChallenge {
  readonly challenge: string;
  readonly challengeId: string;
  readonly expiresAt: string;
}

const refreshWindowMs = 5 * 60 * 1000;
const productionBaseUrl = "https://voice.peacockery.studio";
const labBaseUrl = "https://voice-lab.peacockery.studio";

const configuredEnvironment =
  // biome-ignore lint/complexity/useLiteralKeys: Expo public environment variables use an index signature.
  process.env["EXPO_PUBLIC_PEACOCKERY_VOICE_ENVIRONMENT"];

export const hostedVoiceEnvironment = (): HostedVoiceEnvironment => {
  if (configuredEnvironment === "production") {
    return "production";
  }
  if (configuredEnvironment === "lab") {
    return "lab";
  }
  // biome-ignore lint/complexity/useLiteralKeys: Expo exposes NODE_ENV through an index signature.
  return process.env["NODE_ENV"] === "production" ? "production" : "lab";
};

export const hostedVoiceBaseUrl = (
  environment = hostedVoiceEnvironment()
): string => (environment === "lab" ? labBaseUrl : productionBaseUrl);

const appAttestKeyStoreKey = (environment: HostedVoiceEnvironment) =>
  `vibepad.voice.app-attest-key.v1.${environment}`;
const registrationStoreKey = (environment: HostedVoiceEnvironment) =>
  `vibepad.voice.app-attest-registration.v1.${environment}`;
const tokenStoreKey = (environment: HostedVoiceEnvironment) =>
  `vibepad.voice.device-token.v1.${environment}`;

interface JsonRecord extends Record<string, unknown> {
  readonly error?: unknown;
  readonly scopes?: unknown;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (
  value: Record<string, unknown>,
  key: string
): string => {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Peacockery Voice returned an invalid ${key}`);
  }
  return field;
};

const parseJson = (value: string | null): unknown => {
  if (!value) {
    return;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Invalid secure data is treated as missing and recreated when needed.
  }
};

const decodeRegistration = (
  value: unknown
): AppAttestRegistration | undefined => {
  if (!isRecord(value)) {
    return;
  }
  try {
    return {
      appAttestKeyId: requiredString(value, "appAttestKeyId"),
      dpopJkt: requiredString(value, "dpopJkt"),
      installationId: requiredString(value, "installationId"),
    };
  } catch {
    // Invalid secure data is treated as an absent registration.
  }
};

const decodeToken = (value: unknown): HostedVoiceToken | undefined => {
  if (!isRecord(value)) {
    return;
  }
  const { scopes } = value;
  if (
    !(
      Array.isArray(scopes) &&
      scopes.every((scope) => typeof scope === "string")
    )
  ) {
    return;
  }
  try {
    const environment = requiredString(value, "environment");
    if (environment !== "lab" && environment !== "production") {
      return;
    }
    return {
      credentialId: requiredString(value, "credentialId"),
      environment,
      expiresAt: requiredString(value, "expiresAt"),
      key: requiredString(value, "key"),
      keyPrefix: requiredString(value, "keyPrefix"),
      scopes,
    };
  } catch {
    // Invalid secure data is treated as an absent token.
  }
};

const errorBody = async (response: Response): Promise<string> => {
  let candidate: unknown;
  try {
    candidate = await response.json();
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
  if (isRecord(candidate) && typeof candidate.error === "string") {
    return candidate.error;
  }
  return response.statusText || `HTTP ${response.status}`;
};

export class HostedVoiceCredentialError extends Error {
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "HostedVoiceCredentialError";
    this.status = status;
  }
}

const postJson = async (
  baseUrl: string,
  path: string,
  body: unknown
): Promise<JsonRecord> => {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new HostedVoiceCredentialError(
      await errorBody(response),
      response.status
    );
  }
  const value: unknown = await response.json();
  if (!isRecord(value)) {
    throw new HostedVoiceCredentialError(
      "Peacockery Voice returned an invalid response",
      response.status
    );
  }
  return value;
};

const requestChallenge = async (
  baseUrl: string,
  input: {
    readonly appAttestKeyId: string;
    readonly dpopJkt: string;
    readonly installationId: string;
    readonly purpose: "attestation" | "token";
  }
): Promise<AppAttestChallenge> => {
  const response = await postJson(baseUrl, "/v1/app-installations/challenges", {
    app_attest_key_id: input.appAttestKeyId,
    dpop_jkt: input.dpopJkt,
    installation_id: input.installationId,
    purpose: input.purpose,
  });
  return {
    challenge: requiredString(response, "challenge"),
    challengeId: requiredString(response, "challenge_id"),
    expiresAt: requiredString(response, "expires_at"),
  };
};

const tokenIsFresh = (token: HostedVoiceToken): boolean =>
  Date.parse(token.expiresAt) - Date.now() > refreshWindowMs;

export class HostedVoiceCredentialManager {
  readonly #baseUrl: string;
  readonly #environment: HostedVoiceEnvironment;
  #pendingToken: Promise<HostedVoiceToken> | undefined;

  constructor(environment = hostedVoiceEnvironment()) {
    this.#environment = environment;
    this.#baseUrl = hostedVoiceBaseUrl(environment);
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  get environment() {
    return this.#environment;
  }

  async access(): Promise<{
    readonly signer: SecureDpopSigner;
    readonly token: HostedVoiceToken;
  }> {
    const metadata = await getClientInstallationMetadata();
    const signer = await getSecureDpopSigner(
      this.#environment,
      metadata.installationId
    );
    return { signer, token: await this.#token(metadata, signer) };
  }

  async invalidateToken(): Promise<void> {
    this.#pendingToken = undefined;
    await deleteItemAsync(tokenStoreKey(this.#environment));
  }

  async reset(): Promise<void> {
    this.#pendingToken = undefined;
    await Promise.all([
      deleteItemAsync(appAttestKeyStoreKey(this.#environment)),
      deleteItemAsync(registrationStoreKey(this.#environment)),
      deleteItemAsync(tokenStoreKey(this.#environment)),
    ]);
  }

  async #attest(
    metadata: Awaited<ReturnType<typeof getClientInstallationMetadata>>,
    signer: SecureDpopSigner,
    appAttestKeyId: string
  ): Promise<AppAttestRegistration> {
    const challenge = await requestChallenge(this.#baseUrl, {
      appAttestKeyId,
      dpopJkt: signer.jkt,
      installationId: metadata.installationId,
      purpose: "attestation",
    });
    const attestationObject = await attestKeyAsync(
      appAttestKeyId,
      challenge.challenge
    );
    await postJson(this.#baseUrl, "/v1/app-installations/attestations", {
      app_attest_key_id: appAttestKeyId,
      attestation_object: attestationObject,
      challenge: challenge.challenge,
      challenge_id: challenge.challengeId,
      dpop_jkt: signer.jkt,
      installation_id: metadata.installationId,
      metadata: {
        app_id: metadata.appId,
        app_version: metadata.appVersion,
        client_version: metadata.clientVersion,
        device_model: metadata.deviceModel,
        os_version: metadata.osVersion,
        platform: metadata.platform,
      },
    });
    const registration: AppAttestRegistration = {
      appAttestKeyId,
      dpopJkt: signer.jkt,
      installationId: metadata.installationId,
    };
    await setItemAsync(
      registrationStoreKey(this.#environment),
      JSON.stringify(registration)
    );
    return registration;
  }

  async #registration(
    metadata: Awaited<ReturnType<typeof getClientInstallationMetadata>>,
    signer: SecureDpopSigner
  ): Promise<AppAttestRegistration> {
    if (!isAppAttestSupported) {
      throw new HostedVoiceCredentialError(
        "Hosted voice device attestation requires a physical supported iPhone or iPad",
        501
      );
    }
    const stored = decodeRegistration(
      parseJson(await getItemAsync(registrationStoreKey(this.#environment)))
    );
    if (
      stored?.dpopJkt === signer.jkt &&
      stored.installationId === metadata.installationId
    ) {
      return stored;
    }

    let appAttestKeyId = await getItemAsync(
      appAttestKeyStoreKey(this.#environment)
    );
    if (!appAttestKeyId || stored?.dpopJkt !== signer.jkt) {
      appAttestKeyId = await generateKeyAsync();
      await setItemAsync(
        appAttestKeyStoreKey(this.#environment),
        appAttestKeyId
      );
    }
    return this.#attest(metadata, signer, appAttestKeyId);
  }

  async #mintToken(
    metadata: Awaited<ReturnType<typeof getClientInstallationMetadata>>,
    signer: SecureDpopSigner
  ): Promise<HostedVoiceToken> {
    const registration = await this.#registration(metadata, signer);
    const challenge = await requestChallenge(this.#baseUrl, {
      appAttestKeyId: registration.appAttestKeyId,
      dpopJkt: signer.jkt,
      installationId: metadata.installationId,
      purpose: "token",
    });
    const assertionObject = await generateAssertionAsync(
      registration.appAttestKeyId,
      challenge.challenge
    );
    const response = await postJson(
      this.#baseUrl,
      "/v1/app-installations/tokens",
      {
        app_attest_key_id: registration.appAttestKeyId,
        assertion_object: assertionObject,
        challenge: challenge.challenge,
        challenge_id: challenge.challengeId,
        dpop_jkt: signer.jkt,
        installation_id: metadata.installationId,
      }
    );
    const { scopes } = response;
    if (
      !(
        Array.isArray(scopes) &&
        scopes.every((scope) => typeof scope === "string")
      )
    ) {
      throw new HostedVoiceCredentialError(
        "Peacockery Voice returned invalid token scopes",
        502
      );
    }
    const environment = requiredString(response, "environment");
    if (environment !== this.#environment) {
      throw new HostedVoiceCredentialError(
        "Peacockery Voice returned a token for the wrong environment",
        502
      );
    }
    const token: HostedVoiceToken = {
      credentialId: requiredString(response, "credential_id"),
      environment,
      expiresAt: requiredString(response, "expires_at"),
      key: requiredString(response, "key"),
      keyPrefix: requiredString(response, "key_prefix"),
      scopes,
    };
    await setItemAsync(tokenStoreKey(this.#environment), JSON.stringify(token));
    return token;
  }

  #token(
    metadata: Awaited<ReturnType<typeof getClientInstallationMetadata>>,
    signer: SecureDpopSigner
  ): Promise<HostedVoiceToken> {
    if (this.#pendingToken) {
      return this.#pendingToken;
    }
    const pending = this.#loadOrMintToken(metadata, signer).finally(() => {
      if (this.#pendingToken === pending) {
        this.#pendingToken = undefined;
      }
    });
    this.#pendingToken = pending;
    return pending;
  }

  async #loadOrMintToken(
    metadata: Awaited<ReturnType<typeof getClientInstallationMetadata>>,
    signer: SecureDpopSigner
  ): Promise<HostedVoiceToken> {
    const stored = decodeToken(
      parseJson(await getItemAsync(tokenStoreKey(this.#environment)))
    );
    return stored && tokenIsFresh(stored)
      ? stored
      : this.#mintToken(metadata, signer);
  }
}

export const hostedVoiceCredentials = new HostedVoiceCredentialManager();
