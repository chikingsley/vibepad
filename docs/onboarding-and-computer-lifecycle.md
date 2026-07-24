# VibePad onboarding and computer lifecycle contract

Status: approved implementation contract

This document defines VibePad first-run onboarding, self-hosted computer setup, pairing, automatic Host startup, returning-user recovery, platform behavior, typed state ownership, deterministic fixtures, and acceptance evidence. Product code, tests, fixtures, and screenshots must agree with this contract.

## Product invariants

- First-run onboarding and returning-user recovery are separate systems.
- First-run content stays centered within a restrained maximum width.
- The real VibePad terminal-and-pencil logo appears on branded onboarding surfaces.
- Hosted and self-hosted choices remain visible.
- Existing-Host pairing and SSH installation are distinct paths.
- Pairing requires a one-time invitation and authorizes one client device.
- VibePad Host owns provider process lifecycle and provider ports.
- Existing Codex, OpenCode, browser, and credential installations remain intact.
- Every installation requires an explicit component choice before changes begin.
- Provider authentication attention can follow successful Host setup and pairing.
- Returning users enter the normal application shell with per-computer status.
- Saved computers keep their identity while endpoints and connection status change.
- Automatic Host startup is configurable per computer.
- Fixture screenshots are always identified as fixtures; live acceptance uses real hosts.
- The active implementation contains one path for each product behavior and removes superseded activation and recovery code.

## Terms

**Connect** means VibePad Host already exists and is running. The client discovers or receives the Host endpoint and redeems its pairing invitation.

**Set up** means VibePad connects through SSH, inspects the computer, installs selected missing components, starts VibePad Host, and pairs the client automatically.

**Starting** launches VibePad Host and its configured provider processes.

**Pairing** authorizes the current client device with one Host. Pairing persists across Host restarts.

**Hosted** means a future managed VibePad workspace.

**Self-hosted** means VibePad Host runs on a Mac or Linux computer controlled by the user.

## Screen 1: Welcome

The content is centered vertically and horizontally inside the safe area.

```text
                    [VibePad logo]

                    Code from your iPad

        Work with Codex and OpenCode from anywhere,
        while everything stays on your computers.

                         [ Connect ]
```

The headline adapts to the current surface:

- iPad: `Code from your iPad`
- iPhone: `Code from your iPhone`
- Web: `Code from your browser`

The screen contains the real VibePad logo, one headline, one short explanation, and one primary `Connect` button. It contains no discovery, forms, host names, or technical setup details.

## Screen 2: Where VibePad runs

The heading and choices are centered. Both choices use the same selection-control geometry.

```text
                    Where VibePad runs

        Choose where VibePad keeps your coding sessions,
        credentials, and browser state.

    ┌──────────────────────────────────────────────────────┐
    │  VibePad Hosted                         Coming soon  │
    │  A managed VibePad workspace with no computer setup. │
    └──────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────┐
    │  Your computer                           Self-hosted  │
    │  Keep everything on a Mac or Linux computer you own. │
    │                                                   ›  │
    └──────────────────────────────────────────────────────┘
```

`VibePad Hosted` remains visible as `Coming soon`. `Your computer` is active and opens Screen 3. Standard Back navigation returns to Welcome. The full self-hosted row is interactive.

## Screen 3: Connect your computer

This screen presents the two self-hosted paths. iPad and web use a centered two-column layout with a clear divider. iPhone uses two full-width choices stacked vertically.

```text
                    Connect your computer

        Already running VibePad Host? Connect directly.
        Otherwise, VibePad can set it up over SSH.

    VibePad Host is running       │       Install VibePad Host
                                  │
    Searching nearby…             │   Connect securely over SSH.
                                  │   VibePad will inspect the
    [ hojo          Nearby   › ]  │   computer before installing.
    [ office-linux  Nearby   › ]  │
                                  │       [ Set up with SSH ]
    [ Scan QR code ]              │
```

Automatic nearby discovery begins when this screen opens on supported native platforms. The interface visibly identifies the search, discovered computers, and discovery failures.

### Discovery states

Searching:

```text
[progress] Searching for computers running VibePad Host…
```

One result:

```text
[green status] hojo
Nearby · VibePad Host is ready
                                      [ Connect ]
```

Several results:

```text
hojo                                            ›
office-linux                                    ›
```

Empty:

```text
No computers running VibePad Host were found nearby.

[ Scan QR code ]              [ Set up with SSH ]
```

Local-network permission attention:

```text
Allow local-network access to find VibePad computers nearby.

[ Open Settings ]             [ Scan QR code ]
```

Selecting a discovered computer opens Screen 4. Scanning a QR invitation opens Screen 4 with the Host and code already selected. `Set up with SSH` opens Screen 5.

## Screen 4: Pair with an existing Host

```text
                         hojo

             VibePad Host is running and ready.

                     Pairing code

                    [ XXXX-XXXX ]

                       [ Connect ]

          The code appears on the hojo computer.
```

The screen contains the selected computer name, connection status, one pairing-code field, one primary `Connect` button, and a `Scan QR instead` action where supported. Back returns to Screen 3.

Pairing states include connecting, incorrect code, expired code, Host offline, and success. Success opens Screen 8. The endpoint comes from native discovery or the QR invitation; a raw server-URL field stays outside this flow.

## Screen 5: SSH connection

The form stays centered and compact.

Expanded iPad and web layout:

```text
                    Set up your computer

       Enter the SSH login you already use for this computer.

    Name              SSH host                    SSH port
    [ hojo       ]    [ hojo.local            ]  [ 22 ]

    Username                                  Password
    [ simon                              ]    [ •••••••• ]

                         [ Check computer ]
```

Compact phone layout:

```text
Name
[ hojo ]

SSH host
[ hojo.local ]

SSH port
[ 22 ]

Username
[ simon ]

Password
[ •••••••• ]

[ Check computer ]
```

At expanded widths, Name, SSH host, and SSH port share one row with medium, wide, and narrow proportions. Username and password share the second row. `Check computer` performs inspection without installing or changing software. Password input remains ephemeral. Changed SSH host keys require an explicit security decision.

## Screen 6: Computer inspection

After SSH succeeds, VibePad displays what exists and what each selected installation will change.

```text
                       hojo

               SSH connection established.

    VibePad Host
    Required                                   Will install

    Codex
    Installed · Existing configuration found         ✓

    OpenCode
    Missing                              [ Install: Yes ▾ ]

    Browser tools
    Missing                              [ Install: Yes ▾ ]

             Existing credentials remain unchanged.

                 [ Install and continue ]
```

Supported component states are `installed-ready`, `installed-authentication-required`, `installed-update-available`, `missing-install-selected`, `missing-skip-selected`, and `unavailable`.

VibePad Host is required. Codex and OpenCode are independent optional harnesses, and at least one must be installed or selected. Existing installations and credentials remain intact. Missing tools receive individual install choices. One provider can continue when another provider installation fails or is skipped.

Codex app-server and OpenCode server processes can start before provider authentication completes. Existing authentication is reused. Host installation and pairing continue while missing authentication becomes provider attention inside the connected workspace.

The final option on this screen is:

```text
Start VibePad Host when I open VibePad        [ On ]
```

This setting is stored per computer and can be changed later under `Settings → Computers → <computer>`.

## Screen 7: Installation and startup

One centered progress screen presents real structured events. Each step is pending, active, completed, or failed.

```text
                    Getting hojo ready

    ✓  Connected through SSH
    ✓  Checked existing components
    ◉  Installing OpenCode
    ○  Starting VibePad Host
    ○  Starting configured coding tools
    ○  Pairing this device

          Installing OpenCode… 42 MB of 87 MB

                     [ Cancel ]
```

A completed setup ends with:

```text
    ✓  Connected through SSH
    ✓  Checked existing components
    ✓  Installed OpenCode
    ✓  Started VibePad Host
    ✓  Started Codex and OpenCode
    ◉  Pairing this iPad
```

A failed step shows the short useful error, a `Try again` action, and a continuation action when another ready provider makes continuation valid. All actions use the shared Button component and preserve identical geometry across primary and secondary variants.

## Screen 8: Computer ready

```text
                       [check]

                    hojo is ready

             Codex and OpenCode are available.
              This iPad is securely paired.

                    [ Open VibePad ]
```

`Open VibePad` opens the normal workspace immediately. The screen also advances after a short delay while keeping the action available. Provider-authentication attention appears inside the workspace.

## Returning-user lifecycle

Returning users enter the normal application shell. First-run onboarding stays complete.

The computer status vocabulary is:

- `connecting`: progress indicator
- `connected`: green status
- `starting-host`: startup progress indicator
- `offline`: red status
- `attention`: warning status

The same host status appears in the computer filter and beside folders or chats associated with that host.

### App foreground behavior

1. Load saved computer configuration and cached workspace data.
1. Render the normal shell immediately.
1. Check the active computer first.
1. Connect immediately when Host health succeeds.
1. When health fails and automatic start is enabled, attempt restricted SSH startup.
1. Poll Host health after a successful startup command.
1. Mark the computer connected or offline.
1. Stagger lightweight checks for other saved computers.

### Connecting

The existing workspace remains visible while the active computer displays `Reconnecting to <computer>…`.

### Powered off or unreachable

The computer receives a red offline status. Cached content remains visible.

```text
hojo is offline.

VibePad will reconnect when the computer becomes available.

[ Try again ]       [ Choose another computer ]
```

### Host stopped while the computer is reachable

The installed macOS LaunchAgent uses `RunAtLoad` and `KeepAlive`. The Linux systemd user service is enabled and restarts on failure. These services provide the normal startup path.

When automatic app-triggered startup is enabled, VibePad uses a device-specific restricted SSH key to start or inspect VibePad Host. The key authorizes only VibePad Host status and startup operations, with shell, forwarding, and unrelated commands restricted. The private key stays in platform secure storage. Settings store only an opaque key identifier.

When automatic startup is disabled, the app displays:

```text
VibePad Host stopped on hojo.

[ Start VibePad Host ]       [ Diagnostics ]
```

Selecting `Start VibePad Host` performs the same restricted SSH command manually. A powered-off computer stays offline until power becomes available.

## Platform capabilities

Shared screens and state transitions remain universal. Platform adapters expose actual capabilities.

### iPad and iPhone

- Bonjour discovery
- Native QR scanning
- Native SSH inspection and installation
- Secure recovery-key storage
- Automatic Host startup

iPad uses centered expanded layouts. iPhone uses compact stacked layouts.

### Web

Browser setup supports QR invitations, invitation links, pairing with an already reachable Host, a computer-side installer command, and controller-mediated SSH after a controller Host is paired.

The web installation choice reads:

```text
Install VibePad Host

Run VibePad Host on the computer, then return here to pair it.

[ Copy installer command ]
```

The web client presents its supported invitation and installer paths while native clients present SSH credentials and Bonjour discovery.

## Typed protocol

All external and persisted boundaries use strict Zod schemas in `@vibepad/protocol`, with TypeScript types inferred from those schemas.

The canonical onboarding state is a discriminated union with these screens:

```ts
type OnboardingState =
  | { readonly screen: "welcome" }
  | { readonly screen: "runtime-choice" }
  | { readonly discovery: DiscoveryState; readonly screen: "computer-choice" }
  | { readonly computer: NearbyComputer; readonly screen: "pair-existing" }
  | { readonly values: SshConnectionInput; readonly screen: "ssh-credentials" }
  | { readonly report: ComputerInspection; readonly screen: "computer-inspection" }
  | { readonly progress: InstallationProgress; readonly screen: "installation" }
  | { readonly computer: PairedComputer; readonly screen: "computer-ready" };
```

Protocol types cover discovery, pairing, SSH input, inspection, component selection, progress events, automatic-start configuration, connection status, and platform capabilities. Exhaustive switches guard every union.

The native SSH bridge exposes typed inputs and outputs, and the TypeScript adapter validates every native result and event at runtime. An opaque setup-session identifier represents the native ephemeral SSH session. Cancellation, failure, background expiration, or success destroys the session and clears its credentials.

## State ownership

| State                                | Owner                    | Persistence   |
| ------------------------------------ | ------------------------ | ------------- |
| Current onboarding screen            | Onboarding store         | Ephemeral     |
| SSH form values                      | Screen                   | Ephemeral     |
| SSH password and live session        | Native setup adapter     | Ephemeral     |
| Inspection and installation progress | Onboarding store         | Ephemeral     |
| Saved computers and active computer  | Settings store           | Persisted     |
| Automatic-start preference           | Settings store           | Persisted     |
| SSH recovery private key             | Platform secure storage  | Secure        |
| Recovery-key identifier              | Settings store           | Persisted     |
| Recovery SSH address and user        | Settings store           | Persisted     |
| Live per-computer status             | Connection registry      | Ephemeral     |
| Projects, chats, and providers       | Per-host workspace store | Runtime/cache |
| Deterministic fixture scenario       | Development/test adapter | Ephemeral     |

Legend State owns onboarding progression and the live connection registry. Components subscribe to the smallest field they render. Commands read current state without render subscriptions, and logical multi-field updates use batching.

LegendList remains reserved for large or growing application collections such as sessions, timelines, files, changes, and model catalogs. Onboarding choices, inspection components, and progress steps use ordinary native layout because their size is small and bounded. List rows that display host status subscribe to the relevant `hostId` inside the row instead of invalidating the entire list.

## Persistence migration

Settings schema version 5 stores the automatic-start preference, an opaque recovery-key identifier, and the SSH address, port, and user needed to invoke that key. Version 3 hosts migrate with automatic startup disabled. Version 4 recovery entries also migrate disabled because they lack a typed SSH destination. Private key material remains in platform secure storage and never enters the settings document.

## Runtime performance

- Render the shell from persisted configuration and cache before network completion.
- Check the active computer first and stagger other saved-host checks.
- Pause monitors in the background and refresh on foreground entry.
- Run Bonjour only during onboarding, computer management, and explicit recovery.
- Check Host health before opening SSH.
- Attempt SSH startup only when the per-computer setting is enabled or the user presses Start.
- Use bounded exponential backoff with jitter.
- Cancel stale discovery, health, inspection, installation, and startup work.
- Emit installation progress from real structured events.
- Keep native SSH and QR behavior behind platform adapters.
- Keep fixture infrastructure outside production bundles.
- Measure render fanout and startup behavior in release builds.

## Deterministic fixtures

Fixtures use the production schemas and cover:

- Welcome and runtime choice
- Searching, one nearby computer, several nearby computers, and empty discovery
- Local-network permission attention
- Pairing input, connecting, incorrect code, expired code, offline, and success
- SSH input and authentication failure
- Changed SSH host key
- Every inspection component state
- Selective provider installation
- Provider authentication attention
- Progress for every installation step
- Recoverable and terminal installation failures
- Computer ready
- Returning connected, connecting, starting, offline, and attention
- Automatic startup enabled and disabled
- Multiple computers with mixed status

Fixtures are visually marked in development tooling. Live acceptance screenshots use real Host processes.

## Screenshot acceptance matrix

Every approved screen receives reviewed captures on:

- iPhone portrait, light and dark
- iPad landscape, light and dark
- Web desktop, light and dark

The review checks centering, safe areas, real logo, compact widths, responsive fields, shared button geometry, hosted/self-hosted presentation, visible discovery state, provider-specific copy, progress hierarchy, returning-user shell, computer status, Dynamic Type or browser zoom, reduced motion, keyboard navigation, and screen-reader labels.

## Automated journeys

Required deterministic journeys are:

1. Welcome to self-hosted runtime choice.
1. Nearby Host to pairing code to workspace.
1. QR invitation to workspace.
1. SSH inspection with both providers installed.
1. SSH inspection with one provider missing.
1. Selective installation and real progress.
1. Provider authentication attention without setup blockage.
1. Installation failure, retry, and valid continuation.
1. Automatic Host startup enabled.
1. Automatic Host startup disabled and manual start.
1. Powered-off or unreachable computer.
1. Saved Host reconnect.
1. Multiple computers with mixed status.

Argent supplies simulator exploration, accessibility-tree inspection, screenshots, and runtime profiling. Maestro supplies deterministic journeys. Physical acceptance covers a real iPad, local-network permission, QR, short code, SSH setup on a disposable Mac, automatic startup, Host restart, powered-off behavior, and multiple computers.

## Superseded implementation removal

After the approved flow passes its acceptance gates:

- Remove the stacked pairing and SSH activation page.
- Remove onboarding-style returning-user recovery takeover.
- Remove obsolete OpenCode-only onboarding language.
- Remove raw server-URL onboarding concepts.
- Remove duplicate connection, progress, and status state.
- Remove stale fixtures and screenshots from active evidence.
- Keep one shared button system, one connection-status component, one onboarding state machine, one persisted computer schema, and one runtime connection registry.

## Completion gate

The onboarding and computer lifecycle work is complete when the canonical schemas, fixtures, universal screens, platform adapters, Host capabilities, persistence migration, automatic-start behavior, deterministic journeys, screenshot matrix, physical acceptance, full repository check, and superseded-code removal all pass together.
