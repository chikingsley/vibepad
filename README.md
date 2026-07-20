# VibePad

VibePad is a universal Expo workbench for running coding-agent sessions, inspecting projects and previews, and coordinating work across hosts.

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

The blank-host installer keeps provider credentials in their normal Codex and OpenCode stores and installs version-matched host tools under VibePad's own application-data directory. It does not replace global Homebrew, Bun, or npm packages. Tailscale must already be installed, connected, and reporting an IPv4 address.

From a checkout, install Bun if needed, install the selected managed tools, verify provider-owned authentication, download Chrome for Agent Browser, and install the user service with:

```sh
./scripts/install-host.sh --yes --project-root "$HOME/GitHub"
```

Without `--yes`, an interactive terminal asks before installing Bun or any managed tools. Use `--without-codex`, `--without-opencode`, or `--without-browser` to omit a component. The source/bootstrap layer also supports `--install-dir`, `--repo-url`, `--ref`, and `--source`; run `./scripts/install-host.sh --help` for the complete surface.

Once Tailscale is connected, an existing checkout can also inspect and install the lower-level host service directly:

```sh
bun run host:service -- inspect
bun run host:service -- install --project-root "$HOME/github"
```

Installation discovers the machine's exact Tailscale IPv4 address and short MagicDNS name, refuses a public `0.0.0.0` bind unless it is explicitly allowed, and detects the available Codex and OpenCode executables. It installs a systemd user service on Linux or a LaunchAgent on macOS. The generated environment file is mode `0600`; rerunning the installer replaces only VibePad-owned values and preserves host credentials such as `PEACOCKERY_VOICE_API_KEY`.

The lifecycle commands are:

```sh
bun run host:service -- status
bun run host:service -- pair
bun run host:service -- restart
bun run host:service -- logs
bun run host:service -- uninstall
```

`install` and `restart` wait for the actual `/health` endpoint rather than equating a running process with a ready host. Uninstall removes the service and runner but preserves pairing state and the host environment for recovery.

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

`pair` creates a fresh one-use, ten-minute `XXXX-XXXX` code without exposing a long-lived device credential in shell history. The host environment remains mode `0600`, and uninstall preserves it, the pairing database, the managed toolchain, and source so recovery does not destroy credentials.

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
