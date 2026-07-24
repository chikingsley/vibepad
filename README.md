# VibePad

VibePad is a universal Expo workbench for running coding-agent sessions, inspecting projects and previews, and coordinating work across hosts.

## OpenAI Build Week

VibePad entered OpenAI Build Week as an existing project and received a substantial Codex-driven extension during the July 13–21, 2026 submission period. The inherited project was a Swift OpenCode client with an exploratory SwiftUI implementation. The qualifying work first completed the Swift-native product direction, then archived that implementation and built the active universal Expo product on `main`.

The primary `/feedback` Codex Session ID is `019f70e9-923b-7bd0-8952-75b61089ca37`. The build thread used `gpt-5.6-sol` and continued across the implementation, validation, and release-candidate work.

### Submission-period work

- July 14–17: upgraded the inherited OpenCode integration, rebuilt the native session and chat surfaces, added voice input, and established the flexible workspace and preview direction.
- July 18: preserved the Swift implementation on `archive/swift-native` and started the universal Expo rewrite.
- July 20–21: built the provider-neutral protocol, live OpenCode and Codex adapters, host service, paired-host security, project and session workbench, Files and Changes surfaces, persistent browser Preview, selection and vector drawing feedback, Voice Lab dictation, and responsive iPad/web shell.
- July 21: published iOS 1.0.0 build 6 through EAS and completed TestFlight processing.

### How Codex and GPT-5.6 contributed

Codex with GPT-5.6 served as the implementation partner for the active rewrite. It helped translate the product direction into explicit client, host, protocol, and provider boundaries; generate and validate Codex app-server bindings; implement the Expo and Bun workspace; reproduce timeline, pairing, browser, and voice defects; and turn each reproduced behavior into focused Vitest coverage. Product and engineering decisions stayed human-directed, including the universal Expo architecture, provider capability boundaries, host-owned process lifecycle, session-owned work context, and the spatial review workflow.

### Judge testing path

VibePad Host starts first because it owns the repositories, provider processes, credentials, and preview browser. Each `--project-root` becomes a discoverable Codex project, existing Codex threads contribute their own working directories, and OpenCode contributes the projects reported by its server. The client then pairs once from Settings → Connections and immediately refreshes the host's project and session inventory.

The judge path uses one combined host installer on a macOS or Linux computer connected to the same local network as the iPad:

```sh
curl -fsSL https://vibepad.peacockery.studio/downloads/host/install.sh | \
  bash -s -- --yes --project-root "$PWD"
```

That command installs the selected version-matched Codex and OpenCode tools, verifies their provider-owned authentication, installs the dedicated VibePad browser runtime, installs and starts the host service, checks its health endpoint, and prints one QR invitation plus a ten-minute pairing code. VibePad owns the provider and browser process lifecycle from that point.

On iPad, open the TestFlight build and scan the QR invitation with Camera. The invitation opens VibePad and connects immediately. The short-code path uses local discovery: enter the displayed code in VibePad, then choose Connect. The interface asks for one code and handles the computer address automatically.

For browser-based development, start the web client from the same checkout:

```sh
bun run --filter @vibepad/client web
```

Generate a fresh QR invitation and code later with `bun run host:service -- pair`. A paired computer appears in Settings → Connections, where it can be selected or another computer can be paired.

1. Open a real Codex or OpenCode session and inspect Files and Changes.
1. Open Preview and add selection or drawing feedback.
1. Add a typed or dictated note and send it. VibePad delivers one grounded prompt containing the note, preview URL, timestamps, selection coordinates, and vector points.

A processed TestFlight build supplies the physical iPad path. Access instructions belong in the private Devpost testing field. The web client, host service, protocol packages, and provider adapters share the same repository and quality gate.

The active rewrite is organized as a Bun workspace:

- `apps/client`: the Expo Router client for iPad, iPhone, and web;
- `apps/host`: the local host control plane;
- `packages/protocol`: provider-neutral wire contracts and capabilities;
- `packages/provider-opencode`: the OpenCode harness adapter;
- `packages/provider-codex`: the Codex app-server harness adapter and generated protocol bindings;
- `packages/ui`: VibePad-owned universal components and motion primitives.

The previous SwiftUI application is preserved on `archive/swift-native`; see [`docs/legacy/swift-native.md`](docs/legacy/swift-native.md).

The implementation sequence and evidence gates live in [`docs/TODO.md`](docs/TODO.md). The provider-by-provider contract and coverage inventory lives in [`docs/provider-coverage.md`](docs/provider-coverage.md). The dictation state machine, trusted-host bridge, and hardware promotion gate live in [`docs/voice.md`](docs/voice.md).

## Development

```sh
bun install
bun run dev
```

Run the complete local quality gate with:

```sh
bun run check
```

## Installed host

The blank-host installer keeps provider credentials in their normal Codex and OpenCode stores and installs version-matched host tools under VibePad's own application-data directory. Global Homebrew, Bun, and npm packages remain intact. Local-network pairing works directly; Tailscale adds reachability when the computer and iPad use the same tailnet.

Install the current versioned Host release, its selected managed tools, and the user service with:

```sh
curl -fsSL https://vibepad.peacockery.studio/downloads/host/install.sh | \
  bash -s -- --yes --project-root "$HOME/GitHub"
```

Without `--yes`, an interactive terminal asks before installing Bun or any managed tools. Use `--without-codex`, `--without-opencode`, or `--without-browser` to omit a component. The installer also supports `--install-dir`, `--release-base-url`, `--version`, and the checkout-only `--source` override; run `./scripts/install-host.sh --help` for the complete surface.

The browser option requires a running Docker engine and Compose plugin. It creates a dedicated `vibepad-browser` Compose project with VibePad-only profile, cache, download, and runtime paths. A personal Kasm stack remains separate and intact. Its explicit lifecycle commands are:

```sh
bun run host:browser -- install
bun run host:browser -- status
bun run host:browser -- stop
bun run host:browser -- start
```

An existing checkout can also inspect and install the lower-level host service directly:

```sh
bun run host:service -- inspect
bun run host:service -- install --project-root "$HOME/github"
```

Installation discovers the computer's reachable LAN identity and any available Tailscale identity, listens on its network interfaces, advertises `_vibepad._tcp` through Bonjour, and detects the available Codex and OpenCode executables. It installs a systemd user service on Linux or a LaunchAgent on macOS. The generated environment file is mode `0600`; rerunning the installer replaces only VibePad-owned values and preserves host credentials such as `PEACOCKERY_VOICE_API_KEY`.

The lifecycle commands are:

```sh
bun run host:service -- status
bun run host:service -- pair
bun run host:service -- restart
bun run host:service -- logs
bun run host:service -- uninstall
```

`install` and `restart` wait for the actual `/health` endpoint rather than equating a running process with a ready host. Uninstall removes the service and runner but preserves pairing state and the host environment for recovery.

The public installer also owns packaged-host removal. `uninstall` preserves the VibePad pairing database and host configuration for a later reinstall. `reset` removes VibePad Host state, pairing, configuration, logs, and browser data. Both actions preserve Bun, Codex, OpenCode, Tailscale, SSH keys, credentials owned by those tools, and project files.

```sh
curl -fsSL https://vibepad.peacockery.studio/downloads/host/install.sh | bash -s -- uninstall
curl -fsSL https://vibepad.peacockery.studio/downloads/host/install.sh | bash -s -- reset
```

The host registers OpenCode and Codex concurrently by default. A bootstrap installation owns a private, Basic-authenticated OpenCode server at `http://127.0.0.1:4096` and a local `codex app-server --listen stdio://` child. The OpenCode child starts and stops with the host; an explicitly configured external OpenCode URL remains supported. Relevant overrides are:

- `OPENCODE_BASE_URL` for the OpenCode server;
- `OPENCODE_BIN` for a non-default OpenCode executable;
- `OPENCODE_SERVER_PASSWORD` and optionally `OPENCODE_SERVER_USERNAME` for an OpenCode server protected by HTTP Basic authentication;
- `VIBEPAD_OPENCODE_ENABLED=0` to disable OpenCode;
- `VIBEPAD_OPENCODE_MANAGED=0` to prevent VibePad from starting the OpenCode process;
- `CODEX_BIN` for a non-default Codex executable;
- `VIBEPAD_CODEX_ENABLED=0` to disable Codex;
- `VIBEPAD_CODEX_PROJECT_ROOTS` for a comma-separated set of Codex project roots;
- `PEACOCKERY_VOICE_API_KEY` for the host-side parent key that mints installation-scoped Voice Lab child tokens, never the Expo bundle;
- `PEACOCKERY_VOICE_BASE_URL` only when targeting a non-production Voice Lab environment or isolated fixture.

`pair` creates a fresh one-use, ten-minute QR invitation and `XXXX-XXXX` code while long-lived device credentials stay outside shell history. The QR carries the host identity and endpoint candidates. Bonjour supplies the same reachability for short-code pairing and saved-host recovery. The host environment remains mode `0600`, and uninstall preserves it, the pairing database, the managed toolchain, and source so recovery retains credentials.

Run the complete real Codex adapter suite with:

```sh
bun run test:live:codex
```

That command first rejects generated-binding/runtime version skew, then runs real account, project, session, turn, stream, interrupt, interaction, authentication-failure, process-restart, and malformed-wire journeys. Every tagged thread and temporary Codex home is removed by its owning test, with a fresh app-server inventory check acting as the final cleanup gate.

Run the complete real OpenCode adapter suite with:

```sh
bun run test:live:opencode
```

That command starts a temporary OpenCode server with isolated configuration, exercises all adapter journeys against the real process, then stops the server and removes its temporary state. Isolation prevents a developer's global permission policy from silently auto-approving the permission journey.
