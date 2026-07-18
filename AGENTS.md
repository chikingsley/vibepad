# VibePad working rules

VibePad is one native iPadOS application with Swift 6 strict concurrency and an iPadOS 17.6+
deployment target.

## Source layout

The Xcode project uses synchronized folder groups. The folder tree is the project structure; never
add individual source files by editing `project.pbxproj`.

```text
VibePad/
  App/            app entry point and root composition
  Core/           non-UI runtime grouped by domain
    API/          OpenCode REST/SSE clients and wire models
    SSH/          Citadel connection, forwarding, and key management
    Persistence/  credentials and durable repositories
    Voice/        transcription runtime
  Features/       one folder per user-facing surface
    Workspace/    custom shell, session tabs, and workspace state
    Chat/         timeline, composer, stores, and chat-only components
    Files/        file tree and native file presentation
    Sessions/     session list and state
    Hosts/        server and SSH profiles
    Settings/     settings surface
    Components/   shared VibePad composites
      UI/         reviewed SwiftCN source copied by the swiftcn CLI
  Resources/      shipped non-asset-catalog resources
  Support/        localization, constants, and small cross-cutting helpers
VibePadTests/
VibePadUITests/
VibePadCLI/        the repository's only maintenance CLI
```

- One primary component per Swift file.
- Feature-only composites stay under that feature's `Components/` directory.
- Reusable composites belong in `Features/Components/`.
- Observable UI state belongs in per-domain `@Observable` stores.
- Network, SSH, credential, and durable-storage work belongs in `Core/`.
- `AppState` is transitional. Do not add new responsibilities to it; extract a feature store or
  runtime owner whenever touched.

## UI ownership

The visible workspace shell is custom VibePad/SwiftCN composition. Do not use
`NavigationSplitView`, stock `TabView`, system toolbar placement, or navigation-title APIs to own the
primary rail, session tabs, header, workbench, chat presentation, preview rail, or overlays.

Raw SwiftUI remains the rendering language. Stock leaf controls are fine when they do not take over
workspace navigation. SwiftCN components are copied from the sibling `swiftcn-ui` registry using the
`swiftcn` CLI, `swiftcn.json`, and `.swiftcn.lock.json`; SwiftCN is not a package dependency.

## OpenCode API

Target `/api/*` on OpenCode server 1.17.15+ first. Use legacy routes only where v2 has no equivalent,
as recorded in `docs/OpenCode_API_v2_Audit.md`. Do not add an endpoint without updating the audit and
parity contract.

Never stop or restart an OpenCode process the user is actively using, especially port 4096. Runtime
verification uses a separate temporary server and port.

## Tooling and gates

Durable automation belongs in the Swift package under `VibePadCLI/`; do not add shell or Python
maintenance scripts.

Before declaring application work complete, run sequentially on macOS:

```text
swift run --package-path VibePadCLI vibepad format
swift run --package-path VibePadCLI vibepad lint
swift run --package-path VibePadCLI vibepad build
swift run --package-path VibePadCLI vibepad test
```

UI tests use accessibility identifiers and XCUITest. Do not commit unless the user asks.

## Repository margins

- `docs/VIBEPAD_PRD.md` is canonical product direction.
- `docs/OpenCode_Parity_Matrix.md` is the active OpenCode acceptance ledger.
- `References/OpenCode/` and `References/OrbUI/` are gitignored source references, not app code.
- Do not add sibling app targets, duplicate client trees, root workspaces, or alternate tooling trees.
