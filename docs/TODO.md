# VibePad active work

This file contains the concrete gates between the current implementation and the
next distributable build. Completed work moves to
[`CHANGELOG.md`](../CHANGELOG.md); later product work belongs in
[`ROADMAP.md`](ROADMAP.md).

## Test build

- [x] Validate the production shell in landscape on Hojo's booted iPad simulator
  through Argent Lens.
- [x] Run the shell, Files/Changes, Preview feedback, and persistent
  browser-target Maestro flows against the real root route.
- [x] Confirm the client reconnects to the paired GMK host after a reload
  without losing the selected session or workbench layout.
- [ ] Publish the iOS internal test build and record its build URL and source
  commit.

## Physical iPad acceptance

- [ ] Install the test build on a physical landscape iPad and verify host
  pairing over Tailscale.
- [ ] Exercise a long mixed-height Codex and OpenCode timeline in a release
  build and capture scroll/profile evidence.
- [ ] Verify microphone permissions, foreground PCM capture, Peacockery Voice
  dictation, cleanup, and send.
- [ ] Verify Apple Pencil selection and drawing, including pressure data when
  the hardware supplies it.
- [ ] Exercise Secure Enclave DPoP signing plus bound HTTP and realtime Voice
  traffic.

## Distribution boundary

- [ ] Move production child-token minting behind the Peacockery entitlement
  service.
- [ ] Add App Attest registration and assertion verification for distributed iOS
  builds.
- [ ] Confirm the App Store Connect record, agreements, privacy declarations,
  and TestFlight metadata before external distribution.
