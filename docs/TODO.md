# VibePad active work

This file contains the concrete gates between the current implementation and the next distributable build. Completed work moves to [`CHANGELOG.md`](../CHANGELOG.md); later product work belongs in [`ROADMAP.md`](ROADMAP.md).

## Physical iPad acceptance

- [ ] Exercise the fresh-install activation screen in the current TestFlight build, pair it with a headed host, and capture the connected workspace.
- [ ] Pair the same build with a headless host and verify that headed and headless machines use the same VibePad Host protocol and client flow.
- [ ] Install the test build on a physical landscape iPad and verify QR and short-code pairing over LAN and Tailscale.
- [ ] Exercise a long mixed-height Codex and OpenCode timeline in a release build and capture scroll/profile evidence.
- [ ] Verify microphone permissions, foreground PCM capture, Peacockery Voice dictation, cleanup, and send.
- [ ] Verify Apple Pencil selection and drawing, including pressure data when the hardware supplies it.
- [ ] Exercise Secure Enclave DPoP signing plus bound HTTP and realtime Voice traffic.

## Activation and host setup

- [ ] Exercise the native iOS SSH installer against a disposable fresh macOS computer with a real password credential, verify automatic pairing, then repeat after removing the saved host key.
- [ ] Add key-based authentication or an imported-key flow to first-computer iOS setup; controller-side OpenSSH setup already uses the controller's configured keys.
- [x] Replace the moving private `main` installer URL with the public, checksum-verified, versioned Host release channel at `vibepad.peacockery.studio/downloads/host`.
- [ ] Replace the trusted-LAN HTTP prototype with authenticated encrypted LAN transport.
- [ ] Add a remote short-code rendezvous path for computers outside Bonjour discovery; remote QR invitations already carry their endpoint candidates.
- [ ] Finish the signed macOS VibePad Host release; the public versioned Linux package, checksum validation, upgrades, uninstall, and factory reset are complete.
- [ ] Keep repository shell scripts behind the packaged Host boundary as build and bootstrap infrastructure.
- [ ] Add a same-computer path where VibePad Host launches the loopback web client and supplies pairing automatically.
- [ ] Add an explicit project-root picker and show approved roots, discovered projects, owning provider, provider authentication, and access failures.

## Prototype truthfulness

- [ ] Keep hosted-direct Voice behind an internal availability gate until the production entitlement service, App Attest verification, and physical DPoP acceptance are complete.
- [ ] Present the implemented persistent Chrome surface as Browser Review until the project preview broker owns dev-server start, reuse, readiness, URL, logs, session ownership, explicit stop, and cleanup.
- [ ] Verify that one outgoing review combines the editable note, browser URL, selection coordinates, vector strokes, pressure, viewport, and cue timing.
- [ ] Verify the compact review attachments in chat and the expanded review tray on a physical landscape iPad.

## Deterministic journeys

- [ ] Add a Maestro journey for fresh install, guided pairing, and first workspace value.
- [ ] Add a Maestro journey for a saved host launch and session resume.
- [ ] Add a Maestro journey for host offline, retry, Connections recovery, and successful reconnect.
- [ ] Add a Maestro journey for provider authentication attention and project access attention.
- [ ] Add a Maestro journey for Preview, Draw or Select, editable review, and grounded send.
- [ ] Add a Maestro journey for dictation, transcript editing, and send.
- [ ] Add a Maestro journey for browser availability recovery, host protocol mismatch, and device revocation.

## Distribution boundary

- [ ] Move production child-token minting behind the Peacockery entitlement service.
- [ ] Add App Attest registration and assertion verification for distributed iOS builds.
- [ ] Confirm the App Store Connect record, agreements, privacy declarations, and TestFlight metadata before external distribution.
