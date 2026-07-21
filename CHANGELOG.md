# Changelog

## Unreleased

### Workspace shell

- Replaced the global session-tab working set with one sidebar-owned session
  selection model.
- Rebuilt the landscape header around sidebar control, fading session and
  project context, session-local Chat/Files/Changes/Preview controls, and
  host/service state.
- Added persisted desktop sidebar, expanded-project, selected-session,
  workbench-surface, expanded-layout, and split-ratio state for each host and
  session.
- Added an accessible draggable split divider with bounded persisted ratios.
- Standardized the shell on the shadcn neutral palette, semantic typography
  roles, and platform-sized touch targets.
- Kept harness identity visible in session inventory while model-provider
  identity remains a separate control.

### Timeline and providers

- Added live OpenCode and Codex adapters behind one provider-neutral timeline
  and session contract.
- Added paged history, Legend List virtualization, semantic opening anchors,
  jump-to-latest behavior, and durable Codex event journaling.
- Added compact activity groups for commands, context gathering, file changes,
  reasoning, and provider-native fallback detail.
- Added provider-specific model, agent, mode, reasoning, permission, question,
  interrupt, rename, and archive paths where supported.

### Files, changes, and Preview

- Added session-local Files and Changes surfaces with file tabs, structured
  diffs, aggregate line counts, and virtualized content.
- Added persistent host-owned browser targets, VibePad-owned browser tabs and
  navigation, exact Kasm surface streaming, and independent profile storage.
- Added Browse, Select, and Draw modes with normalized vector and selection
  data, timestamps, and one shared review draft.
- Rendered review moments as attachment cards in the existing composer or the
  expanded Preview tray.

### Voice, host, and security

- Added foreground dictation, waveform takeover, cursor-aware insertion,
  optional Peacockery cleanup, and send-after-transcription.
- Added paired-host authorization, one-use human pairing codes, SecureStore
  credential ownership, device revocation, and direct Tailscale reachability.
- Added installation-scoped Peacockery Voice child tokens, metadata provenance,
  DPoP contracts, nonce and replay protection, and generated clients.
- Added blank-host bootstrap, user services, provider discovery, Agent Browser,
  Chrome for Testing, and dedicated Kasm browser setup.

### Quality and tooling

- Added strict TypeScript, Ultracite/Biome, Vitest, Maestro, Argent, Markdown,
  and provider-parity gates.
- Added deterministic shell, provider, timeline, file, browser, review, voice,
  pairing, and bootstrap coverage.
- Proved the real landscape shell, session lifecycle, file navigation, changes,
  Preview review, and persistent browser targets on Hojo's native iPad
  simulator; lifecycle flows archive their temporary sessions.
