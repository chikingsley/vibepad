import createClient from "openapi-fetch";
export const peacockeryVoiceBaseUrls = {
    lab: "https://voice-lab.peacockery.studio",
    production: "https://voice.peacockery.studio",
};
export const createPeacockeryVoiceClient = (options) => {
    const environment = options.environment ?? "production";
    return createClient({
        baseUrl: options.baseUrl ?? peacockeryVoiceBaseUrls[environment],
        fetch: options.fetch,
        headers: { Authorization: `Bearer ${options.apiKey}` },
    });
};
