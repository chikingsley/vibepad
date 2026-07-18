# VibePad

VibePad is a universal Expo workbench for running coding-agent sessions,
inspecting projects and previews, and coordinating work across hosts.

The active rewrite is organized as a Bun workspace:

- `apps/client`: the Expo Router client for iPad, iPhone, and web;
- `apps/host`: the local host control plane;
- `packages/protocol`: provider-neutral wire contracts and capabilities;
- `packages/provider-opencode`: the first harness adapter;
- `packages/ui`: VibePad-owned universal components and motion primitives.

The previous SwiftUI application is preserved on `archive/swift-native`; see
[`docs/legacy/swift-native.md`](docs/legacy/swift-native.md).

## Development

```sh
bun install
bun run dev
```

Run the complete local quality gate with:

```sh
bun run check
```

