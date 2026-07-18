# VibePad agent rules

## Scope

- The active product is the TypeScript/Expo rewrite on `main`.
- The SwiftUI implementation is historical and lives on
  `archive/swift-native`; do not copy it into the active tree.
- Keep one universal Expo client for iPad, iPhone, and web.
- Keep host process ownership outside the client application.

## Tooling

- Use Bun for JavaScript and TypeScript packages, scripts, and execution.
- Use TypeScript 7 in strict mode.
- Use UltraCite with Biome for formatting and linting.
- Use Vitest for protocol, host, and provider tests that defend observable
  behavior or a reproduced regression.
- Do not add Jest, snapshots, mock-heavy tests, coverage-padding tests, or empty
  placeholder files.

## Architecture

- Start with a real OpenCode vertical slice before generalizing providers.
- Normalize only stable product concepts. Preserve provider-native payloads and
  expose optional behavior through capability maps.
- Prefer upstream-generated SDK and protocol types to handwritten mirrors.
- Keep provider transport, normalization, and UI controls in separate modules.
- Keep agent-bus separate from chat transport; it owns coordination, safe-point
  control, handoffs, and resource leases.
- Keep preview process lifecycle in the host-side preview broker.

## React and Expo

- Keep frequently changing timeline and transport state out of broad app-level
  contexts.
- Split subscriptions by feature and select derived state narrowly.
- Avoid barrel files and eager imports of heavy preview or editor surfaces.
- Build motion through shared Reanimated primitives and tokens rather than
  scattered one-off durations.
- Add React Native Reusables components as source only when a real surface uses
  them; do not import the entire registry.

## Git

- Do not commit or push unless the user asks.
- Do not add `.gitkeep` or other empty placeholder files.
- Preserve unrelated user changes and verify archive refs before deleting
  legacy implementation paths.

