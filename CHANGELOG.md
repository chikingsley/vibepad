# Changelog

## Unreleased

### Workspace shell

- Replaced the global session-tab working set with one sidebar-owned session selection model.
- Rebuilt the landscape header around sidebar control, fading session and project context, session-local Chat/Files/Changes/Preview controls, and host/service state.
- Added persisted desktop sidebar, expanded-project, selected-session, workbench-surface, expanded-layout, and split-ratio state for each host and session.
- Added an accessible draggable split divider with bounded persisted ratios.
- Standardized the shell on the shadcn neutral palette, semantic typography roles, and platform-sized touch targets.
- Kept harness identity visible in session inventory while model-provider identity remains a separate control.

### Timeline and providers

- Added live OpenCode and Codex adapters behind one provider-neutral timeline and session contract.
- Added paged history, Legend List virtualization, semantic opening anchors, jump-to-latest behavior, and durable Codex event journaling.
- Added compact activity groups for commands, context gathering, file changes, reasoning, and provider-native fallback detail.
- Added provider-specific model, agent, mode, reasoning, permission, question, interrupt, rename, and archive paths where supported.

### Files, changes, and Preview

- Added session-local Files and Changes surfaces with file tabs, structured diffs, aggregate line counts, and virtualized content.
- Added persistent host-owned browser targets, VibePad-owned browser tabs and navigation, exact Kasm surface streaming, and independent profile storage.
- Added Browse, Select, and Draw modes with normalized vector and selection data, timestamps, and one shared review draft.
- Rendered review moments as attachment cards in the existing composer or the expanded Preview tray.

### Voice, host, and security

- Added foreground dictation, waveform takeover, cursor-aware insertion, optional Peacockery cleanup, and send-after-transcription.
- Added paired-host authorization, one-use human pairing codes, SecureStore credential ownership, device revocation, and direct Tailscale reachability.
- Replaced address entry with one pairing surface: QR invitations carry host identity and endpoint candidates, short codes use Bonjour discovery, and saved computers refresh their LAN address automatically.
- Made Tailscale an optional reachability layer and enabled the same host installer, service, and client flow on a local network.
- Added first-computer SSH setup to the iOS client: enter one SSH login, install and start VibePad Host remotely, then pair the device automatically.
- Added controller-side OpenSSH discovery so an existing VibePad Host can resolve concrete SSH config entries and set up additional computers with their existing key-based login.
- Added trust-on-first-use SSH host-key persistence and changed-key rejection to the native iOS bootstrap path.
- Removed startup-generated orphan codes, host-address controls, device-name controls, duplicate authorization panels, and bootstrap diagnostic output from the activation journey.
- Added installation-scoped Peacockery Voice child tokens, metadata provenance, DPoP contracts, nonce and replay protection, and generated clients.
- Added blank-host bootstrap, user services, provider discovery, Agent Browser, Chrome for Testing, and dedicated Kasm browser setup.

### Quality and tooling

- Added strict TypeScript, Ultracite/Biome, Vitest, Maestro, Argent, Markdown, and provider-parity gates.
- Added deterministic shell, provider, timeline, file, browser, review, voice, pairing, and bootstrap coverage.
- Proved the real landscape shell, session lifecycle, file navigation, changes, Preview review, and persistent browser targets on Hojo's native iPad simulator; lifecycle flows archive their temporary sessions.
- Published iOS 1.0.0 build 6 from commit [`6459df2`](https://github.com/chikingsley/vibepad/commit/6459df2e450ebc993e1f67aee8e669f25df3c928) through [EAS Build](https://expo.dev/accounts/peacockery-studio/projects/vibepad/builds/82ed9384-2aa9-4d27-a117-3c6eb0112d62) and completed its [TestFlight submission](https://expo.dev/accounts/peacockery-studio/projects/vibepad/submissions/b44cc7f4-900d-4dbc-adab-d1499c68a4b6); [App Store Connect](https://appstoreconnect.apple.com/apps/6792378876/testflight/ios) processed the build as valid with export compliance resolved.
- Built iOS 1.0.0 build 13 with native Bonjour discovery through [EAS Build](https://expo.dev/accounts/peacockery-studio/projects/vibepad/builds/88ea3273-fe25-45dc-991f-323d38d025b7) and completed its [TestFlight submission](https://expo.dev/accounts/peacockery-studio/projects/vibepad/submissions/945bff1d-85be-4899-b953-5fba66157786).
