# VibePad

VibePad is a native iPadOS client for OpenCode. It connects to an OpenCode server, presents a
SwiftCN-owned workspace, and adds automatic previews, Pencil context, and voice steering.

## Repository

```text
VibePad.xcodeproj/   Xcode project, targets, schemes, and Swift package resolution
VibePad/             shipped application source and resources
VibePadTests/        Swift Testing and integration tests
VibePadUITests/      XCUITest acceptance coverage
VibePadCLI/          the single Swift maintenance CLI
Config/              release configuration
References/          gitignored OpenCode and Orb UI reference checkouts
docs/                canonical product, API, parity, and test documentation
```

The Xcode project uses synchronized folder groups. The filesystem is the source layout; do not add
individual files to `project.pbxproj`.

## Open and build

Open `VibePad.xcodeproj` in Xcode. The shared app scheme is `VibePad`.

The maintenance interface is the root-level Swift CLI:

```text
swift run --package-path VibePadCLI vibepad format
swift run --package-path VibePadCLI vibepad lint
swift run --package-path VibePadCLI vibepad build
swift run --package-path VibePadCLI vibepad test
swift run --package-path VibePadCLI vibepad parity check --require-upstream
swift run --package-path VibePadCLI vibepad providers check
swift run --package-path VibePadCLI vibepad providers sync
swift run --package-path VibePadCLI vibepad test-flight upload
```

The Xcode and release commands require macOS. The OpenCode reference checkout is expected at
`References/OpenCode` when source parity verification is requested. SwiftCN components are copied
from the sibling `swiftcn-ui` registry using `swiftcn.json` and `.swiftcn.lock.json`.

## Product delivery

The four TestFlight cuts are defined in `docs/VIBEPAD_PRD.md`:

1. OpenCode workspace.
2. Automatic live preview.
3. Pencil feedback.
4. Voice/orb interaction.

`docs/OpenCode_Parity_Matrix.md` is the acceptance ledger for native OpenCode coverage.
