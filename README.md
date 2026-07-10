# VibePad

VibePad is a native iPad client for [OpenCode](https://github.com/opencode-ai/opencode). It connects to an OpenCode server so you can work with sessions, chat, tool calls, diffs, files, voice input, and host/SSH profiles from an iPad.

VibePad is under active development. There is no VibePad TestFlight or App Store build yet; the current goal is a stable developer beta.

## What works today

- Chat with streaming responses, reasoning, tool cards, permissions, questions, todos, image attachments, and model/agent selection.
- Browse remote files, search, diffs, Markdown, code, and images.
- Create, fork, archive, restore, and delete sessions.
- Connect directly over LAN, VPN, Tailscale, or HTTPS with optional Basic Auth.
- Connect through a key-authenticated Citadel SSH tunnel with TOFU host-key checking.
- Dictate through the existing VoiceFlowKit integration.
- Select an OpenCode project or enter a custom remote directory; project-scoped API requests carry that directory.

The active project context is the connected host, selected remote directory/worktree, and current session. It is the place where OpenCode requests run—not the model's context window. The next product slice will make that context persistently visible before adding live previews and Pencil markup.

## Requirements

- iPadOS 17.6 or later.
- A reachable OpenCode server started with `opencode serve` or `opencode web`.
- For development: Xcode 26.6 or later with iOS/iPadOS platform support.
- For repository checks: Apple's `swift-format` and SwiftLint.

The current baseline uses the Swift 6 language mode, complete strict concurrency checking, the Swift 6.3.3 compiler, and the iOS/iPadOS 26.5 SDK. The deployment target remains iPadOS 17.6 so the app supports more than only the newest iPadOS release.

## Connect an iPad

1. Start OpenCode on the host, for example with `opencode serve --port 4096`.
2. Make the service reachable from the iPad. Prefer a trusted LAN, VPN/Tailscale route, HTTPS, or the built-in SSH tunnel.
3. In VibePad, add or select a host, test the connection, and choose a project/directory.
4. Create or select a session and open Chat.

Do not expose an unauthenticated OpenCode server directly to the public internet.

## Repository layout

| Path | Purpose |
|---|---|
| `OpenCodeClient/` | The only shipped app tree: Xcode project, sources, unit tests, and UI tests. |
| `docs/` | Product requirements, API notes, test notes, and the active TODO. |
| `scripts/` | Deterministic formatting and lint helpers plus small maintenance scripts. |
| `opencode-official/` | Optional, gitignored checkout of the OpenCode server for integration work. |
| `VibePad.xcworkspace/` | Shared workspace and pinned Swift package resolution. |

## Development

Install the checks once:

```bash
brew install swift-format swiftlint
```

Format and lint:

```bash
./scripts/format.sh
./scripts/lint.sh
```

Enable the repository-managed pre-commit check once per clone:

```bash
git config core.hooksPath .githooks
```

The hook verifies Apple `swift-format` and SwiftLint without rewriting files. If it fails, run `./scripts/format.sh` and retry. Builds and tests stay out of pre-commit because they are substantially slower.

Open the workspace, not a second app tree:

```bash
open VibePad.xcworkspace
```

Build from the command line:

```bash
xcodebuild -workspace VibePad.xcworkspace \
  -scheme OpenCodeClient \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

Build tests and run unit tests sequentially against an installed iPad simulator:

```bash
xcodebuild -workspace VibePad.xcworkspace \
  -scheme OpenCodeClient \
  -destination 'platform=iOS Simulator,name=iPad (A16)' \
  CODE_SIGNING_ALLOWED=NO build-for-testing

xcodebuild -workspace VibePad.xcworkspace \
  -scheme OpenCodeClient \
  -destination 'platform=iOS Simulator,name=iPad (A16)' \
  CODE_SIGNING_ALLOWED=NO test-without-building \
  -only-testing:OpenCodeClientTests
```

Do not run build and test concurrently: they share Xcode's build database. The shared scheme keeps UI tests serial because parallel UI workers require cloned simulators and proved unreliable on this Xcode/runtime combination. The command-line override below makes that intent explicit:

```bash
xcodebuild -workspace VibePad.xcworkspace \
  -scheme OpenCodeClient \
  -destination 'platform=iOS Simulator,name=iPad (A16)' \
  -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test-without-building \
  -only-testing:OpenCodeClientUITests \
  -skip-testing:OpenCodeClientUITests/Tier4DriverUITests
```

`Tier4DriverUITests` is environment-driven live-server testing. Its send flow requires an explicit `OPENCODE_SERVER_URL` or `TIER4_SERVER_URL` plus `TIER4_PROMPT`. Never point it at an OpenCode process someone is actively using; use a separate temporary server and port.

## Upstream

The app began as a fork of [`grapeot/opencode_ios_client`](https://github.com/grapeot/opencode_ios_client). Preserve that upstream as a read-only Git remote after the VibePad repository is created.
