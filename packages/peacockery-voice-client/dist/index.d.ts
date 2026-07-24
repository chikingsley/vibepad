import type { paths } from "./schema.js";
export type { components, operations, paths } from "./schema.js";
export declare const peacockeryVoiceBaseUrls: {
    readonly lab: "https://voice-lab.peacockery.studio";
    readonly production: "https://voice.peacockery.studio";
};
export type PeacockeryVoiceEnvironment = keyof typeof peacockeryVoiceBaseUrls;
export interface PeacockeryVoiceClientOptions {
    apiKey: string;
    baseUrl?: string;
    environment?: PeacockeryVoiceEnvironment;
    fetch?: typeof globalThis.fetch;
}
export declare const createPeacockeryVoiceClient: (options: PeacockeryVoiceClientOptions) => import("openapi-fetch").Client<paths, `${string}/${string}`>;
export type PeacockeryVoiceClient = ReturnType<typeof createPeacockeryVoiceClient>;
