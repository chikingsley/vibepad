# Voice

VibePad keeps three voice products separate:

1. session and review dictation creates editable text;
1. spoken notifications summarize important state;
1. a global conversational orchestrator operates typed session and coordination controls.

The implemented slice is session dictation only. It does not auto-enable TTS or create a global voice agent.

## Composer behavior

The microphone button sits beside Send. Starting dictation requests foreground microphone permission, connects to Voice Lab, and replaces the composer body with a rounded recording surface:

- Stop on the left ends audio and returns the committed transcript to the editable draft.
- The waveform keeps its newest samples on the right and never grows the composer.
- The arrow on the right ends audio, inserts the committed transcript, and then sends the resulting draft.

The selection is saved before the composer transforms. A committed transcript replaces the selected range or inserts at the cursor with boundary-aware spacing. Interim events are retained by the controller but hidden by default. The Voice settings page can reveal them inside the recording surface, where the preview is limited to two lines rather than growing over the conversation. The preference is off by default and persists independently of host credentials.

The controller uses these explicit phases:

| Phase                   | Meaning                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `idle`                  | No capture exists.                                                                    |
| `requesting_permission` | The client is resolving microphone access.                                            |
| `connecting`            | The trusted host and Voice Lab WebSockets are opening.                                |
| `recording`             | PCM is being captured and streamed.                                                   |
| `processing`            | Audio has stopped and the terminal transcript is pending.                             |
| `failed`                | Permission, transport, provider, or no-speech handling produced a retryable UI state. |

## Transport and credentials

The iPad path uses Expo Audio 57's native `AudioStream` with signed 16-bit PCM. The web adapter uses `getUserMedia` and Web Audio behind the same controller. Both paths downmix and resample actual device output to 16 kHz mono linear16 before transmission.

The client opens `/v1/voice/realtime` on the VibePad host. The host then opens the authenticated Voice Lab WebSocket with fixed, audited transcription parameters:

- model `elevenlabs-scribe_v2`;
- 16 kHz, one channel, `linear16`;
- dictation and punctuation enabled;
- interim results enabled with a 200 ms target delay.

The host environment exclusively owns `PEACOCKERY_VOICE_API_KEY`; Expo public variables and client bundles carry VibePad credentials only. The configured key is a parent credential with `client_tokens:mint` plus the scopes it may delegate. VibePad Host uses it only to mint a one-hour child token for the active installation, caches that token in memory, and refreshes it before expiry. The child receives only `models:read`, `text:write`, `transcriptions:read`, and `transcriptions:write`. Neither the parent nor the child token is returned to the iPad. `PEACOCKERY_VOICE_BASE_URL` defaults to `https://voice-lab.peacockery.studio` and exists primarily for isolated integration fixtures.

The app creates a random installation UUID and keeps it stable across ordinary launches. Pairing also records app ID and version, client version, device model, platform, and OS version in the host authorization database. After the host validates the paired `vp_` token, it sends those values to Voice Lab through the existing `X-Peacockery-*` metadata headers on HTTP and realtime requests. Voice Lab can therefore partition retained training and product evidence by installation and device model without treating a hardware serial number as a credential. The host-issued paired-device ID remains distinct from the installation UUID.

This metadata is attribution, not authentication. The current `vp_` credential and managed Voice token remain bearer tokens. Making a copied VibePad token useless on another device requires a later proof-of-possession protocol: a non-exportable device key, signed request proofs with nonce and replay validation, and optionally Apple App Attest for app-instance attestation. For distributed production installs, the parent minting credential must move from the user's host into a Peacockery-controlled service; the internal lab flow intentionally keeps it on the trusted host for now.

### Direct device option

The canonical Peacockery Voice working tree on GMK now implements the server half of the direct device-bound path. A client-token request can explicitly choose DPoP, the child stores a P-256 JWK thumbprint beside its opaque token hash, the global HTTP and realtime-upgrade gate verifies RFC 9449-style proofs, and D1 stores short-lived nonce state plus hashed proof IDs for replay rejection. Existing Bearer keys remain compatible. The regenerated TypeScript client handles one nonce challenge and proof retry; the regenerated Swift schema exposes the binding fields and builds on Hojo. The Worker migration and code have not been deployed.

The target native flow is:

1. The remaining VibePad client slice creates a P-256 signing key whose private half remains in the Secure Enclave and exposes only its public JWK thumbprint.
1. The device signs a DPoP proof for token minting. The trusted parent authorizes the mint, while Peacockery Voice binds the short-lived child to that device key and returns token type `DPoP`.
1. Each HTTP call carries `Authorization: DPoP <token>` and a unique proof covering the method, URL, issue time, proof ID, access-token hash, and the current five-minute server nonce.
1. The realtime WebSocket authenticates its upgrade with the same bound token and a fresh proof. React Native 0.88 accepts native WebSocket headers, so iOS can send both headers without a special WebSocket module. Browser WebSocket cannot set those headers; web keeps the host bridge or exchanges a DPoP-authenticated HTTPS request for a one-use socket ticket.
1. A hardware acceptance then proves Secure Enclave persistence, nonce refresh, token expiry, revocation, background/foreground behavior, HTTP, and realtime on iPad. App Attest registration and assertions remain a separate hardening layer.

App Attest is a separate app-integrity layer. The server can verify an attestation when the device key is registered and assertions at important refresh or recovery points. The Secure Enclave keeps the DPoP signing key non-exportable; App Attest provides evidence that the registration came from a legitimate VibePad app instance. Neither mechanism replaces TLS, and code already running inside a compromised app can still request signatures.

On 2026-07-20, Hochi reached GMK directly through Tailscale in about 1 ms, and repeated VibePad health connections completed in about 5 ms. The host relay therefore adds a measurable but small local hop in the current Tailnet. Direct native Voice remains attractive because it survives a host outage and constrains a stolen child token to one device; latency is the secondary benefit. The host bridge remains the simpler internal and web path until the canonical service implements DPoP.

The development host binds to loopback by default; the installed service discovers and binds to its selected Tailscale address for direct tailnet access. Remote HTTP and WebSocket requests require a paired device token, with the Voice WebSocket token carried in a negotiated subprotocol instead of the URL. Until the native Secure Enclave signer and entitlement-mediated mint route are implemented, VibePad continues using this tested host bridge rather than representing the direct path as available.

The exact generated Peacockery Voice TypeScript client owns the HTTP model catalog and text cleanup calls. The host filters `/v1/models` to language models and sends coding or light cleanup prompts through `/v1/text`; the client inserts the raw transcript when optional cleanup fails. Realtime audio remains a specialized WebSocket protocol outside that generated HTTP client, so the host bridge owns it directly. Voice Lab stores transcription artifacts according to its service policy; this integration does not claim zero retention.

## Evidence and remaining gate

On 2026-07-19, the authenticated Voice Lab catalog advertised `elevenlabs-scribe_v2` with both batch and realtime routes. The automated realtime host test uses two actual Bun WebSocket servers and proves parent-to-child token minting, the installation and device headers, the child Authorization header, binary PCM, fixed query parameters, and a terminal transcript across the bridge. A separate HTTP fixture proves that one cached child token serves the generated-client model and cleanup calls with the same metadata and emits the exact cleanup request. The SQLite pairing fixture proves that installation and device-model metadata survives beside the hashed paired credential.

On 2026-07-20, a live lab parent credential minted a 60-second child with exactly the four VibePad scopes. That child authenticated the generated catalog request with installation and device metadata and returned 26 language models. The test then revoked the child through the administrative route; a follow-up status lookup returned `revoked`. Before child-token delegation was added, VibePad's generated-client routes were also exercised against Voice Lab with a protected host credential: the live catalog returned 19 language models, and `google-gemini-3.1-flash-lite` cleaned the test dictation to `Fix the sidebar spacing and run bun run check.` The web app was then exercised with Chromium's synthetic microphone:

- idle composer: [dictation-idle-web.png](assets/voice/dictation-idle-web.png)
- active composer: [dictation-recording-web.png](assets/voice/dictation-recording-web.png)
- Stop returned an editable transcript without sending it;
- a real keyboard cursor between `before` and `after` produced `before Synthetic microphone transcription after`;
- the browser reported no page or console errors.

That validates browser behavior and the product dataflow, not iPad hardware. Promotion still requires a landscape iPad dev-build pass for permission grant and denial, start, stop, cancel, no speech, retry, interruption, real microphone PCM, the bounded-interim preference, and the final send choice. Review-capture timestamp alignment is a later slice built on the same audio controller.
