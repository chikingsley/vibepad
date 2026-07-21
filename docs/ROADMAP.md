# VibePad roadmap

The current release gates live in [`TODO.md`](TODO.md). This roadmap keeps later
product work visible without mixing it into the active build checklist.

## Session awareness and coordination

- Add local unread and attention state based on background completion and
  viewing position.
- Add the contextual inspector and provider-native event detail surfaces.
- Add agent-bus discovery, handoffs, safe-point pause and resume, and host
  resource leases.
- Add the global voice orchestrator for cross-project status and typed
  coordination actions.

## Files and projects

- Add file, symbol, and changed-file search plus branch comparison.
- Add binary, image, and generated-asset previews.
- Add archived-session browsing, filtering, pagination, and provider-supported
  restoration.

## Preview and browser

- Add project preview lifecycle, readiness, logs, ownership, and explicit stop
  controls.
- Add mobile, tablet, and desktop CDP emulation presets.
- Add exact target-side DOM hit testing, screenshots, downloads, profile
  isolation, and explicit profile clearing.
- Add session-owned Browserless leases for parallel agents while retaining Kasm
  as the visible authenticated handoff surface.
- Add passive mini-live Preview when an agent starts browser work and explicit
  foreground requests for user input.

## Voice and review

- Align transcript spans with review cues and raster screenshots.
- Add hold-to-talk review gestures and voice-command Send.
- Add concise spoken completion and attention notifications.
- Add local speech engines and bring-your-own-provider options.

## Platforms and distribution

- Adapt the shared system to phone layouts and Android.
- Evaluate React Native macOS after the iPad workflow is stable.
- Add hosted VibePad hosts and browser workers for users who choose a managed
  setup.
- Add App Store subscriptions and hosted Voice entitlements near external
  release preparation.
