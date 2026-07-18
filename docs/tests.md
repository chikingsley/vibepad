# VibePad test strategy

VibePad uses native Swift and Xcode test surfaces. The deleted Python UI driver is not part of the
test architecture.

## Layers

1. **Contract and state tests** in `VibePadTests` cover wire decoding, store transitions, regressions,
   and deterministic fixtures.
2. **XCUITest acceptance** in `VibePadUITests` drives visible application behavior through stable
   accessibility identifiers.
3. **Disposable live-server acceptance** runs against a separate OpenCode process and port. It must
   never interrupt the user's server on port 4096.
4. **TestFlight acceptance** verifies the completed cut on a physical iPad.

Unit tests are added when they freeze an important contract, state transition, or discovered
regression. File presence and compilation alone do not advance parity status.

## Commands

Run gates sequentially on macOS:

```text
swift run --package-path VibePadCLI vibepad format
swift run --package-path VibePadCLI vibepad lint
swift run --package-path VibePadCLI vibepad build
swift run --package-path VibePadCLI vibepad test
```

For focused XCUITest work, invoke `xcodebuild` directly against `VibePad.xcodeproj`, scheme `VibePad`,
and an installed iPad simulator. Screenshots and `.xcresult` bundles are temporary evidence and are
not committed.

The onboarding XCUITest fixture accepts `UITEST_ONBOARDING_STATE` values `welcome`, `choice`, `form`,
`checking`, `install`, `start`, `connected`, and `offline`, plus `UITEST_THEME=dark|light`.
`testCaptureOnboardingStateScreenshots` writes the visual acceptance set to
`/tmp/vibepad-onboarding-screenshots` by default; `ONBOARDING_SCREENSHOT_DIR` overrides that path
when the test runner receives it. `testLivePasswordSSHBootstrap` is opt-in through either
`VIBEPAD_LIVE_SSH_*` test-runner environment variables or a temporary
`/tmp/vibepad-live-ssh-config.json` file. It must target a disposable SSH host and dedicated
OpenCode port, never the user's port 4096 process.

## Acceptance rule

A capability is complete only when its native owner is integrated into the shipped path, its API
contract is verified, its important visible behavior has XCUITest evidence, and the corresponding
TestFlight cut works on a physical iPad. The current state is tracked in
`OpenCode_Parity_Matrix.md`.
