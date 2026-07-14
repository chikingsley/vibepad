# VibePad — working rules

VibePad is a native iPadOS client for OpenCode. One shipped app tree
(`OpenCodeClient/`), Swift 6 strict concurrency, iPadOS 17.6+.

## Source layout

The Xcode project uses synchronized folder groups: the folder tree **is**
the project structure. Never add files by editing `project.pbxproj`.

```
OpenCodeClient/OpenCodeClient/
  App/            @main, ContentView (tab shell), window plumbing
  App/State/      AppState + extensions — transitional; dissolving into
                  per-domain @Observable stores that live with their feature
  Core/           non-UI runtime, grouped by domain
    API/          APIClient, SSEClient + wire models (Core/API/Models)
    SSH/          Citadel tunnel + key management
    Persistence/  Keychain and local storage helpers
  Features/       one folder per user-facing surface; views + feature state
                  + feature-only components live together
    Chat/         chat tab, stores, controllers; composites in Components/
    Files/        file browser, content viewer, markdown preview
    Sessions/     session list + store
    Hosts/        host profiles
    Settings/     settings tab
    Components/   shared design system; vendored SwiftCN goes in Components/UI
  Support/        L10n, constants, small cross-cutting helpers
```

Rules:

- One primary component per Swift file. Screens compose components and
  connect runtime state.
- Feature-only composites go under that feature's `Components/`; reusable
  composites go in `Features/Components/`.
- Stores own observable UI state (`@Observable`, `@MainActor`). Runtime
  work (network, SSH, persistence) lives in `Core/`, not in stores or views.
- Do not grow `App/State/AppState*`: new state goes in a per-domain store.
  When touching an `AppState` extension, prefer extracting it.

## UI: native first, then SwiftCN

- Use stock SwiftUI controls first (`NavigationSplitView`, `List`, `Form`,
  `Picker`, `Toggle`, `TextField`, `.searchable`, …).
- Custom UI uses the shadcn-style open-code model: copy reviewed SwiftCN
  primitives from the sibling `swiftcn-ui` repo into
  `Features/Components/UI/` via the `swiftcn` CLI (config in `swiftcn.json`,
  drift tracked in `.swiftcn.lock.json`). Do not add SwiftCN as a package
  dependency.
- Before adopting a SwiftCN primitive, compare it with the current upstream
  shadcn component. Source presence in `swiftcn-ui` is not validation.
  SwiftCN contains only 1:1 ports of real shadcn components.

## Server API

- Target the OpenCode v2 API (`/api/*`, server ≥ 1.17.15) first. Legacy
  routes are allowed only where v2 has no equivalent; the mapping and the
  rationale live in `docs/OpenCode_API_v2_Audit.md`. Re-check that document
  before adding any new endpoint call.
- Never kill or restart an OpenCode process the user is actively using
  (especially anything on port 4096). For runtime verification, start a
  separate temporary server on another port.

## Gates

Run before declaring work done — build and test sequentially, never in
parallel (shared build database):

```bash
./scripts/format.sh && ./scripts/lint.sh
xcodebuild -workspace VibePad.xcworkspace -scheme OpenCodeClient \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Unit tests run on an installed iPad simulator via `build-for-testing` +
`test-without-building -only-testing:OpenCodeClientTests` (see README).
Keep chat-input UI tests anchored on accessibility identifiers, not
`TextField` queries (the composer uses UIKit bridges).
Do not commit unless the user asks. Pre-commit verifies formatting via
`git config core.hooksPath .githooks`.

## Repo margins

- `docs/` — PRD/RFC/API notes; `docs/TODO.md` is historical, not a work queue.
- `scripts/` — format/lint helpers and `testflight.sh` (App Store Connect
  upload via API key; see script header).
- `web_preview_shell/` — dev source for the markdown preview WKWebView
  bundle shipped in `OpenCodeClient/Resources/WebPreview`.
- `ui_driver/` — optional Python simctl/XCTest harness for driving the app
  in a simulator; not part of the app build.
- `orb-ui/`, `opencode-official/` — gitignored scratch/reference checkouts.
- Do not add sibling app targets or duplicate client trees at repo root.
