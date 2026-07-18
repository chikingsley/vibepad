# Paseo deep dive and VibePad direction

Date: 2026-07-18

Status: working architecture and product assessment. This is not an implementation plan or a
commitment to fork every Paseo subsystem.

## Executive decision

Paseo is a strong foundation for the host-side agent control plane and a useful reference client,
but it should not become VibePad's product design unchanged.

The daemon, provider adapters, resumable session machinery, typed WebSocket protocol, encrypted
relay, and agent tool catalog solve difficult infrastructure problems well enough that rewriting
them would be wasteful. The current Expo client proves that one daemon can control Claude Code,
Codex, OpenCode, and many ACP providers from iPad. It also exposes exactly where VibePad can be
better: project-first session discovery, a deliberate motion system, stable provider visibility,
native visual feedback, browser/preview streaming, and explicit shared-resource coordination.

The recommended direction is:

1. Treat Paseo's daemon and protocol as reusable infrastructure or an upstream dependency.
2. Build VibePad's interaction model as a separate client/product layer.
3. Add agent-bus semantics for cross-harness presence, cooperative control, and resource leases
   instead of overloading Paseo chat rooms.
4. Use SSH for bootstrap and private tunneling, WebSocket for the application control plane, and
   WebRTC only when continuous pixels/audio require it.
5. Keep the local daemon local. Use Cloudflare for rendezvous, relay, presence, static web assets,
   durable coordination, and optional media signaling—not for running local CLIs, PTYs, Git, or
   filesystem operations.

## What was verified

The assessment is based on the local checkout at `/home/simon/github/paseo`, current `main` commit
`a1de743ef67dde4fe7c48d045a3714f65dfa5e90`, source version `0.2.0-beta.1`.

The installed production daemon remained running and was not restarted. It is the Bun-global
`@getpaseo/cli@0.1.110`, listening on loopback and connected outbound to the Paseo relay. Its live
provider report showed Claude, Codex, and OpenCode available; Copilot and Pi enabled but unavailable;
and OMP disabled.

The US App Store metadata reported iOS version `0.1.109`, released 2026-07-16. This is important:
the iPad app, installed daemon, and source checkout are three independently versioned artifacts.

Repository checks against the locked source checkout:

- `npm ci`: succeeded.
- Oxlint: 2,781 files, 177 rules, zero warnings and zero errors in 840 ms.
- App type check: passed after building its workspace dependencies.
- Server type check: passed after building its workspace dependencies.
- Focused provider/session tests: 3 files, 60 assertions, all passed.
- Full suites were intentionally not run; Paseo's own contributor rules prohibit broad local test
  runs because they can freeze the machine.
- Production dependency audit: 45 advisories (5 low, 29 moderate, 10 high, 1 critical). These need
  path and exploitability triage. The direct `ws@8.20.0` resolution is particularly relevant because
  daemon, relay, CLI, and desktop packages use WebSockets; the current registry release is newer.

## Architecture in plain English

Paseo does not send prompts directly to model APIs as one generic chat app. A local Node daemon
starts and supervises the real installed agent programs in the user's environment. Each provider has
an adapter that translates its native process/session protocol into one Paseo timeline and lifecycle
model.

```text
iPad / web / desktop / CLI
            |
            | one typed WebSocket protocol
            | direct, tunneled, or E2E relay
            v
      local Paseo daemon
            |
            +-- Claude Agent SDK -> local Claude Code executable
            +-- Codex app-server JSON-RPC -> local Codex executable
            +-- OpenCode SDK/server -> local OpenCode executable
            +-- ACP -> any compatible installed agent
            +-- Pi / OMP native adapters
            |
            +-- Git, filesystem, PTY, worktrees, browser automation
```

The important design boundary is the daemon. It owns local authority: process launch, credentials
inherited from each provider, filesystem access, PTYs, Git, and persistent agent metadata. The app
is a remote control surface, not the execution environment.

### Wire protocol

Clients use one long-lived WebSocket connection. Most frames are JSON. Terminal I/O and file
transfer use compact binary frames. The initial client `hello` identifies client type, protocol
version, app version, and capabilities; the server responds through a normal status envelope with
server identity, version, and feature capabilities.

The application protocol includes:

- agent lifecycle and timeline streams;
- correlated request/response RPCs;
- permission and question flows;
- workspace, Git, worktree, schedule, loop, and script state;
- terminal streams;
- provider snapshots and native-session import;
- voice/dictation events;
- explicit application-level ping/pong for browser and React Native portability.

The relay path is not plaintext proxying. The pairing offer carries the daemon public key in the URL
fragment, then the client and daemon derive an ephemeral shared key. Application traffic is
authenticated and encrypted end to end with NaCl box. The relay still observes connection metadata,
timing, sizes, IPs, and session identifiers. The current security document acknowledges that replay
tracking inside one live encrypted session is not implemented; that is a protocol-hardening item.

### Provider adapters

Paseo's native adapters preserve much more harness behavior than a generic API wrapper would:

- provider-specific modes and model catalogs;
- native permissions and questions;
- provider session identifiers and resume/import;
- provider-owned subagents;
- MCP/native tool injection;
- provider configuration, skills, and local credentials.

The provider architecture is one of the strongest reasons not to rewrite the daemon.

## Claude Code and subscription behavior

Paseo uses `@anthropic-ai/claude-agent-sdk`, but its adapter resolves and passes a local Claude Code
executable through `pathToClaudeCodeExecutable`, launches that binary as a child process, uses the
Claude Code system-prompt preset, loads Claude settings/`CLAUDE.md`, and resumes Claude's native
session identifier. The local machine currently reports authenticated first-party Claude.ai Max
credentials.

As of 2026-07-18, Anthropic's own help center says its announced separation of Agent SDK usage was
paused: Agent SDK, `claude -p`, and third-party app usage still draw from subscription limits for
now. That may change. Anthropic's SDK documentation also says third-party developers may not offer
Claude.ai login or rate limits without approval and recommends API credentials for third-party
products. Paseo does not implement a Claude login flow—it launches an already-authenticated local
binary—but the policy boundary remains worth treating as unstable.

Practical decision:

- Do not replace this with direct Anthropic API calls just to simplify the adapter.
- Preserve the real Claude Code harness and its local session/config behavior.
- Do not promise that subscription-backed third-party control is permanent.
- Keep Claude as a provider that can be disabled independently if Anthropic changes enforcement.

## The thinking-popup bug and hot reload

The source checkout's current HEAD is specifically:

`fix(app): align thinking section scroll layout with other detail sections (#1884)`

It replaces the plain thinking/detail body with a nested vertical `ScrollView`, gives the container
`minHeight: 0`, and aligns it with the other detail-section layout. This is highly likely to be the
thin-sliver bug observed in the iPad app.

It is not present in the installed App Store binary:

- App Store iOS: `0.1.109`.
- Installed daemon CLI: `0.1.110`.
- Checkout: `0.2.0-beta.1` after the fix commit.

There are three different update loops:

1. **Expo development client:** Metro Fast Refresh can update JS/TS/styles on the connected iPad.
   A development build must be installed and able to reach Metro. Linux can serve Metro, but an iOS
   development binary still has to be built by Xcode on a Mac or by EAS.
2. **Expo web:** `expo start --web` refreshes in a normal browser. This is useful for much of the
   shared UI, but it does not prove iPad-native sheets, keyboard behavior, or gestures.
3. **Production App Store app:** the clone cannot hot-reload into it. Paseo has EAS Update configured,
   but updates are constrained by channel and runtime version. The runtime policy is `appVersion`, so
   a `0.2.0-beta.1` update cannot simply replace a `0.1.109` runtime. Native dependency changes require
   a new binary; compatible JS/style fixes can be OTA-published to the matching runtime.

For dogfooding, install a Paseo/VibePad development build on the iPad and point it at a reachable
Metro server. Do not use the App Store binary as the primary UI iteration loop.

## UI stack and what RNR would mean

The app already uses a current React Native stack:

- Expo 54, React Native 0.81.5, React 19.1;
- Expo Router;
- React Native Unistyles;
- Reanimated and Gesture Handler;
- Gorhom bottom sheets;
- TanStack Query, Zustand, Zod, Lucide, and React Navigation.

It is not using React Native Reusables. It has roughly 164 custom UI component files and a broad
Unistyles-based theme/component system.

RNR is not a conventional binary component dependency; it is a shadcn-like source registry for
building a local component library. Its current variants target NativeWind or Uniwind and RN
Primitives. It does not target React Native Unistyles. A full RNR conversion therefore means a real
styling-system migration, not swapping imports.

Recommendation:

- Do not replace every component with RNR in one pass.
- First define VibePad's tokens, density, corner language, typography, interaction states, and motion
  grammar.
- Prototype a small RNR/Uniwind shell in a separate client or branch: buttons, menu, sheet, tabs,
  tooltip, select, command palette, and form controls.
- Compare bundle, render, keyboard, portal, accessibility, and iPad split-view behavior against the
  existing Unistyles primitives.
- If it wins, migrate by vertical feature slices. Do not run Unistyles plus NativeWind/Uniwind across
  the whole product indefinitely.
- Generated/copied `components/ui` code can be excluded from high-level opinionated rules while still
  receiving syntax, type, security, and import checks.

For a new VibePad Expo client, RNR is a reasonable starting kit. For Paseo itself, the custom UI is
too large for a cheap wholesale conversion.

## Why the app feels unanimated despite having Reanimated

The package includes Reanimated and uses it for real mechanics. Thirty-five source files import it;
mobile panels, keyboard avoidance, gestures, drag/reorder, and selected transitions are animated.
Only eight files use the common spring/timing sequence primitives directly, nine declare
enter/exit/layout transitions, and many ordinary press/navigation/disclosure operations still switch
state immediately.

The issue is not “install an animation library.” It is the absence of a consistent product-wide
motion grammar.

VibePad should define a small set of motion primitives:

- press feedback and hover/focus transitions;
- sheet/menu enter and exit;
- panel resize and fullscreen transitions;
- provider/model drill-in and back transitions;
- session insertion/removal/reordering;
- streaming/thinking expansion and collapse;
- optimistic pending -> success/failure transitions;
- reduced-motion behavior.

Animations should explain continuity and hierarchy. Adding arbitrary fades to every block will only
make the UI slower.

## Model and provider selector

The user's observation is backed by the shared selector builder:

```ts
return (entries ?? [])
  .filter((entry) => entry.enabled)
  .map(...)
```

Disabled providers vanish. Enabled but unavailable providers remain and become error rows. This
creates an unstable catalog: provider identity appears and disappears based on settings rather than
remaining understandable.

Recommended model:

- Always show every configured/catalog provider in a stable order.
- Distinguish `ready`, `loading`, `unavailable`, `not installed`, `not authenticated`, `disabled`, and
  `error` visually.
- Permit drilling into every provider for diagnostics/setup even when no model is selectable.
- Keep model selection disabled only at the final invalid action, not at provider discovery.
- Separate favorites/recent models from the canonical provider catalog.
- Preserve the current provider while moving between all-provider and provider-specific views.
- Add a real-device flow test for provider drill-in, back, retry, enable/disable, and model selection.

## Existing-session discovery

Paseo already knows how to discover and import provider-native sessions:

- Claude scans native persisted session files;
- Codex calls app-server thread listing;
- OpenCode uses its server SDK;
- the daemon filters by canonicalized working directory and excludes sessions already imported;
- selecting a row imports/resumes that one native session and hydrates its timeline.

The current client hides this behind an explicit import sheet. It requests at most 15 recent sessions
per enabled provider and optionally scopes by working directory. That is useful recovery plumbing,
not the automatic project behavior VibePad needs.

Recommended project-first behavior:

1. Opening a project triggers a cheap native-session index query for every configured provider.
2. Existing sessions appear immediately in one timeline list, labeled by provider and state.
3. A native-only session is represented as an unmanaged/provisional row; do not create a duplicate
   Paseo agent merely to display it.
4. Selecting the row lazily imports/adopts it into Paseo and hydrates full history.
5. Project matching uses host identity plus canonical cwd/worktree identity, not basename alone.
6. Pagination replaces the fixed 15-per-provider ceiling.
7. Chat-sync supplies global/cross-machine historical search, while provider/Paseo state remains the
   authority for live session control.

This produces the Codex-like “add project and all relevant sessions are there” behavior without
eagerly mutating daemon state.

## Browser, preview, and visual dogfooding

Paseo contains a serious Electron browser implementation: persistent resident `<webview>` guests,
shared browser profile, CDP automation, element references, screenshot capture, page annotation,
and a real-Electron compositor harness. That functionality is desktop-only. The native and normal web
`BrowserPane` implementations currently render an “unavailable” placeholder.

Therefore the iPad app cannot simply expose the Electron browser pane. The reusable asset is the
host-side browser automation/capture engine and its element-ref protocol.

VibePad's target loop should be:

```text
host preview/browser process
  -> reachable page or pixel stream
  -> iPad preview surface
  -> Pencil/touch overlay + optional voice
  -> screenshot + vector strokes + viewport/URL/DOM context
  -> active agent session
```

For ordinary dev servers, a reachable URL inside `WKWebView`/React Native WebView is the cheapest and
best preview because the browser performs rendering and hot reload directly. Send the current URL,
viewport, screenshot, Pencil strokes, and optionally a host-resolved DOM element reference.

For Mac Simulator/native-app or desktop-only content, stream pixels from a host broker. That is when
WebRTC becomes useful. Do not force every web preview through video.

The host preview manager remains separate from the agent daemon conceptually. It owns start, health,
logs, restart, stop, port assignment, and exposure of project previews. Agents may call it through a
tool, but pressing Preview should not depend on asking a model to discover or launch the service.

## Agent orchestration: Paseo versus agent-bus

Paseo already has substantial orchestration:

- managed agent lifecycle and parent/child labels;
- provider-native subagent tracking;
- a transport-neutral agent tool catalog, with native tools or MCP adapters;
- create/send/wait/update agent operations;
- chat rooms;
- schedules, loops, and worktrees;
- terminal activity hooks with coarse running/idle/needs-input state.

This is enough for an agent to create and steer Paseo-managed agents. It is not the same problem as
coordinating independent harnesses and scarce host resources.

Agent-bus adds the missing cross-harness contract:

- durable actor identity and heartbeat/presence;
- cursor-based delivery and acknowledgements;
- idempotent producer event IDs;
- cooperative command lifecycle (`queued -> acknowledged -> in-progress/at-safe-point -> complete`);
- ETA/checkpoint details;
- target-advertised pause/resume/cancel capabilities;
- exclusive resource leases with TTL and a one-active-owner invariant.

The two systems should integrate, not merge blindly.

Recommended integration:

1. Run agent-bus beside the Paseo daemon as a small local coordination service/library.
2. Register each Paseo-managed agent and each external harness session as a bus actor.
3. Expose bus operations through Paseo's existing tool catalog/MCP surface.
4. Translate Paseo lifecycle events into heartbeats/status, without pretending a busy process is
   safely pausable.
5. Add a VibePad Resource Center showing hosts, agents, current work, ETA, leases, and live telemetry.
6. Name resources explicitly: `gpu:0`, `xcode:team-mac`, `port:4096`, `repo:<host>:<realpath>`.
7. Keep pause/resume cooperative. Never freeze or signal a process in the middle of a write.
8. Add adapters for unmanaged Claude Code, Codex, and OpenCode sessions so they can participate even
   when they were not launched by Paseo.

Paseo chat rooms can remain conversational. Agent-bus records should be authoritative for control
and resource ownership.

## SSH, WebSocket, and WebRTC

These are complementary layers, not three equivalent choices.

### SSH

SSH is excellent for:

- first-run host bootstrap;
- installing a device key;
- starting/recovering a local daemon;
- private TCP forwarding when direct networking is unavailable;
- emergency shell access and diagnostics.

SSH can carry a WebSocket perfectly well through a local port forward. The objection is not to SSH
encryption. The objection is using an interactive shell/tunnel itself as the product protocol.
Embedded SSH adds key/host-trust UI, background reconnection, port lifecycle, and per-host tunnel
management. It does not define typed agent events, replay, subscriptions, capability negotiation, or
multi-client coordination.

### WebSocket

WebSocket is the correct reliable application control channel:

- bidirectional and long lived;
- directly supported by browsers and React Native;
- one connection can multiplex many agents, terminals, resources, and subscriptions;
- works direct, over VPN, through an SSH tunnel, or through an encrypted relay;
- supports explicit reconnect, cursor catch-up, and protocol versioning.

Paseo's decision to use WebSocket is sound. VibePad can keep SSH as a setup/transport option while
speaking the same application protocol over the forwarded socket.

### WebRTC

WebRTC earns its complexity for continuous low-latency media:

- browser/simulator/desktop video;
- audio and realtime voice;
- optional low-latency input data channels.

It also requires signaling, ICE, NAT traversal, and often TURN. It is unnecessary for ordered agent
timelines, permissions, leases, and ordinary screenshots. Use WebRTC as a media sidecar while keeping
the authoritative control plane on WebSocket.

## Cloudflare placement

The local daemon cannot be replaced by a Worker. It needs local processes, PTYs, filesystem access,
Git, provider credentials, and long-lived supervision.

Cloudflare is well suited to the public coordination edge:

- Pages/Workers for the web client and APIs;
- Durable Objects for per-user/per-host presence, rendezvous, WebSocket fan-out, and small durable
  coordination state;
- WebSocket hibernation for mostly-idle connected sessions;
- Tunnel for private outbound host exposure;
- R2 for optional screenshots/artifacts;
- Queues/Workflows for notifications and asynchronous maintenance;
- signaling/TURN or a media service for WebRTC when continuous streaming is added.

Paseo already deploys its Expo web export to Cloudflare Pages and uses a separate Cloudflare/Vite
website package. Expo's native app uses Metro; replacing its bundler with Vite would fight Expo
Router and React Native Web for little product gain. Use Vite for a separate browser/admin client if
desired, not as a prerequisite for the iPad client.

For an agent-bus cloud bridge, a Durable Object can coordinate connected replicas, but local SQLite
or another local durable log should remain the source for offline host-side commands. Cloud presence
must never be mistaken for proof that a local agent reached a safe point.

## Code-quality assessment

This is not a toy repository. It has unusually strong documentation, strict lint rules, typed
boundaries, compatibility notes, focused real-process tests, and serious work on provider quirks,
mobile reconnection, terminal behavior, and Electron browser correctness.

The code is nevertheless too concentrated:

- 383,320 lines of non-test TS/TSX under package `src/` directories;
- 32 non-test source files at or above 2,000 lines;
- 6,577-line Codex adapter;
- 6,296-line server session coordinator;
- 5,774-line daemon client;
- 5,638-line protocol message module;
- 5,593-line Claude adapter;
- 4,263-line OpenCode adapter;
- 4,149-line agent manager;
- 4,097-line workspace screen;
- 3,256-line message component;
- 3,068-line diff pane;
- 192 explicit `COMPAT(...)` markers.

The repository's strength—rapidly preserving behavior across many harnesses and clients—has produced
large files that own transport, state, policy, compatibility, and presentation simultaneously.
This raises change cost and makes UI regressions possible despite broad test coverage.

Recommended decomposition boundaries:

- split the protocol into domain schema modules while preserving one public export surface;
- split daemon session RPC handlers by domain and make `session.ts` composition-only;
- split the daemon client into transport, request correlation, subscriptions, and domain clients;
- split each provider into launch, catalog, lifecycle, timeline normalization, permissions, history,
  and import/resume modules;
- split workspace screen into a controller plus independent panel/layout domains;
- split message rendering by timeline item type;
- retire compatibility paths by daemon/app support floor rather than accumulating permanent branches.

### Tests

The repo contains 1,017 test/spec files, including 102 files named as daemon E2E, 43 real-provider
E2E files, and 92 Playwright specs. Its current testing document explicitly says tests should prove
behavior, prefer real dependencies, and reject mock-heavy component tests. That philosophy matches
VibePad's requirements.

There is still migration debt: 49 test files use `vi.mock`, and 27 app test files reference Testing
Library/render-style component tests even though the current policy says those patterns are slop on
the way out. Do not delete tests by category or chase coverage numbers. Classify them:

- keep tests that defend a reproduced regression or protocol/process invariant;
- convert critical user flows to real daemon/browser/provider tests;
- delete shallow accessor, private-state, snapshot, and mock-implementation tests when they defend no
  observable behavior;
- add a real iPad/development-build smoke for sheet layout, keyboard, provider selection, preview,
  and annotation because web/component tests will not catch the thin-sliver class of bug.

### Lint and formatting

Paseo already uses a strong Oxlint/Oxfmt setup. Current UltraCite supports Oxlint/Oxfmt as well as
Biome, ESLint, and other toolchains. Therefore:

- do not replace Oxc with Biome merely to say the repo uses UltraCite;
- trial the current UltraCite Oxc presets and compare rule deltas;
- preserve Paseo-specific architecture/import/React Native rules and burn-down lists;
- run security/dependency scanning separately—lint passing does not make the dependency graph safe;
- use Biome only if a measured rule/formatter advantage outweighs migration churn.

## Prioritized work

### P0: make the current experience trustworthy

- Ship or locally dogfood the current thinking-section fix in a development/OTA-compatible build.
- Keep every configured provider visible and fix selector back/drill/retry state.
- Add project-first native-session discovery with lazy import and pagination.
- Triage and patch network-boundary dependency advisories, beginning with direct `ws` consumers.
- Add current app/daemon/protocol version diagnostics in one visible place.

### P1: VibePad visual feedback loop

- Establish the host preview-manager contract.
- Load reachable previews directly on iPad with hot reload.
- Add Pencil annotation, screenshot composition, viewport/URL metadata, and one-action send.
- Add a consistent motion system and real-device regression flows.
- Reuse/adapt Paseo's browser element-ref and screenshot semantics where useful.

### P2: cross-harness coordination

- Bridge Paseo agents into agent-bus actors.
- Add presence, ETA, safe-point commands, and GPU/Xcode/port/repo leases.
- Add Resource Center UI and host telemetry.
- Test Claude Code, Codex, and OpenCode adapters with real one-shot workflows and fake resource jobs.

### P3: media and cloud edge

- Add host-side browser/Simulator capture broker.
- Add WebRTC only for continuous pixel/audio streams.
- Move rendezvous/presence to Cloudflare Durable Objects if cross-network/multi-device demand justifies
  it; retain local authoritative control state.

### P4: structural cleanup

- Decompose the protocol, daemon session, client, provider adapters, workspace screen, and message
  renderer by the boundaries above.
- Burn down compatibility paths and legacy mock/component tests incrementally.
- Evaluate an RNR/Uniwind client shell through measured iPad prototypes before committing to a full
  styling migration.

## External references

- Paseo source: <https://github.com/getpaseo/paseo>
- React Native Reusables: <https://reactnativereusables.com/docs>
- UltraCite: <https://github.com/haydenbleasel/ultracite>
- Expo EAS Update: <https://docs.expo.dev/eas-update/introduction/>
- Anthropic Agent SDK overview: <https://code.claude.com/docs/en/agent-sdk/overview>
- Anthropic current subscription notice: <https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan>
- Cloudflare Durable Objects WebSockets: <https://developers.cloudflare.com/durable-objects/best-practices/websockets/>
