# Legend migration ledger

This ledger records the measured migration from React-owned application state and mixed scrolling surfaces to Legend State and Legend List. A slice earns complete status after its focused behavior test, repository gate, and interactive path pass.

## Baseline

- Baseline commit: `4c6284d` (`feat: build VibePad host and client foundation`)
- Baseline gate: UltraCite passed across 189 files, every workspace TypeScript check passed, and 65 Vitest tests passed.
- Client source: 15,323 lines across TypeScript and TSX.
- React ownership: 121 `useState` occurrences in 30 files, 42 `useEffect` occurrences in 16 files, and 230 `useCallback` occurrences in 39 files.
- Legend ownership: one normalized workspace registry and one `useValue` consumer.
- Collection surfaces: one `LegendList`, two `FlatList` instances, and 13 files containing `ScrollView`.
- Concentration: six client source files exceed 500 lines; 16 exceed 300 lines.
- Type escapes: no `any`, `as any`, `@ts-ignore`, or `@ts-expect-error` occurrences were found in authored client code.
- Lint suppressions: the client has six narrow suppressions covering ordered stream reads, strict environment index signatures, one iframe load event, and ephemeral waveform indexes. None suppress state, Hook, or type-safety rules.

### Largest client files at baseline

| Lines | File                                                  | Primary pressure                                                                                   |
| ----: | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
|   730 | `features/preview/components/preview-surface.tsx`     | Browser tabs, navigation, review capture, and rendering share one owner.                           |
|   624 | `features/settings/components/settings-dialog.tsx`    | Navigation, three settings pages, Voice Lab catalog loading, and dialog chrome share one file.     |
|   585 | `features/workspace/components/session-canvas.tsx`    | Timeline, interactions, composer, workbench, and provider controls converge in one component.      |
|   519 | `features/workspace/components/workspace-sidebar.tsx` | Project/session projection and scrolling share presentation code.                                  |
|   512 | `lib/use-host-workspace.ts`                           | Transport lifecycles, reconnection, pagination, caches, and React state are mixed together.        |
|   501 | `features/workspace/components/workspace-shell.tsx`   | Shell layout, tabs, selection, workbench layouts, settings, and session mutations share one owner. |

## Ownership contract

| Domain                | Durable owner                                                                | React boundary                                                                                     | Persistence or transport                                                                 |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Settings              | One application-scoped Legend store                                          | Leaf selectors for each preference and persistence state                                           | Existing Expo SQLite KV and web `localStorage` adapters                                  |
| Host runtime          | Stable context containing imperative clients and stores                      | Context changes only when the host connection changes                                              | Authenticated HTTP and NDJSON                                                            |
| Workspace             | Normalized Legend registries keyed by project, session, and provider ID      | Status, ID lists, individual rows, and selected entities subscribe separately                      | Atomic workspace bootstrap plus event-driven session upserts                             |
| Shell navigation      | Host-scoped Legend UI store                                                  | Sidebar, active tab, workbench, and settings controls subscribe to their own keys                  | Settings persistence only where user preference warrants it                              |
| Services and catalogs | Keyed Legend resource stores                                                 | Selected project and picker surfaces subscribe independently                                       | Abortable host requests with request generation guards                                   |
| Timeline              | One session-scoped Legend runtime per open session                           | Page metadata, running state, pagination state, and individual timeline items subscribe separately | Bootstrap, ordered NDJSON events, debounced repair loads, and SQLite-backed host journal |
| Interactions          | Session-scoped Legend registry                                               | Each permission or question row subscribes by interaction ID                                       | Host reads plus event-triggered refresh                                                  |
| Files and changes     | Project-scoped Legend resource stores                                        | Tree rows, selected file, content, and change rows subscribe separately                            | Abortable host requests                                                                  |
| Preview               | Session-scoped Legend browser/review store                                   | Tab strip, active frame, navigation controls, cues, and tray subscribe separately                  | Dedicated browser service later; review drafts remain local until sent                   |
| Drawing hot path      | Reanimated shared values and Skia or gesture state                           | React receives only completed normalized strokes or selections                                     | Review store receives completed cues                                                     |
| Ephemeral leaf input  | Component-local state or Legend reactive input when measurement proves value | State stays at the leaf                                                                            | No persistence unless promoted into a domain store                                       |

## List contract

Legend List is used for collections that can grow, recycle, page, or affect mount cost. Bounded button groups and nested code-output panes retain simpler primitives when virtualization provides no useful windowing.

| Surface                                | Baseline                      | Target                                                 | Recycling condition                                                                                           |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Timeline                               | `LegendList`                  | Retain and tune                                        | Stable timeline item ID, session `dataKey`, complete row reset audit, anchor tests                            |
| Changes                                | `FlatList`                    | `LegendList`                                           | Stable file path or change ID; row state derived entirely from item and selection                             |
| Provider models                        | `FlatList`                    | `LegendList`                                           | Stable provider/model compound ID; query is explicit invalidation input                                       |
| Workspace project/session tree         | `ScrollView` plus mapped rows | Flattened `LegendList`                                 | Stable typed row IDs; collapse state external to recycled rows                                                |
| File tree                              | `ScrollView` plus mapped rows | Flattened `LegendList`                                 | Stable path; indentation and status derived from row data                                                     |
| Session tabs                           | Horizontal `ScrollView`       | Horizontal `LegendList` when tab overflow is exercised | Stable session ID; close/selection state passed explicitly                                                    |
| Browser tabs                           | Horizontal `ScrollView`       | Horizontal `LegendList` when browser service is live   | Stable browser-tab ID; loading/navigation state supplied by tab record                                        |
| Voice cleanup models                   | `ScrollView` plus mapped rows | `LegendList`                                           | Stable model ID; query supplied as explicit invalidation input                                                |
| Settings pages and small choice groups | `ScrollView`                  | Retain                                                 | Bounded form content; virtualization would add no useful windowing                                            |
| Patch and shell output panes           | Nested `ScrollView`           | Retain initially                                       | Nested vertical virtualization inside the timeline is avoided; cap and expand behavior is measured separately |

## Migration slices

- [x] Establish a normalized workspace registry and prove one session update leaves unrelated session subscriptions silent.
- [x] Checkpoint the complete known-good host and client foundation.
- [x] Replace settings context value fan-out with a stable Legend settings store while retaining the decoded SQLite and browser storage boundary.
- [ ] Split workspace reads into status, ID-list, and entity-level selectors; remove the broad reconstructed snapshot subscription from hot UI.
- [ ] Move shell tabs, selected session, sidebar visibility, settings route, and per-session workbench layout into a host-scoped Legend UI store.
- [ ] Move services and provider catalogs into keyed Legend resource stores with request cancellation and generation checks.
- [ ] Move each open session timeline and interaction lifecycle into its own Legend runtime; keep transport loops imperative and expose narrow observable state.
- [ ] Move project files and changes into project-scoped Legend resource stores.
- [ ] Move preview browser tabs, navigation state, completed review cues, and tray state into a session-scoped Legend store; keep active pointer samples off the React thread.
- [ ] Convert justified growing collections according to the list contract and audit every recycled row.
- [ ] Extract domain components until transport/store files and visual components have one clear responsibility; record exceptions rather than chasing an arbitrary line limit.
- [ ] Add lightweight shell motion through the smallest compatible motion primitive while preserving Reanimated and Skia for native drawing and gesture work.
- [ ] Validate web, landscape simulator or device, real host session navigation, timeline paging, session switching, browser review, and cleanup after live fixtures.
- [ ] Build a dedicated VibePad Kasm stack with its own compose project, containers, ports, volumes, browser profile, credentials, and lifecycle. The personal Kasm stack is never a VibePad dependency or test target.

## Measurement contract

Each migration slice records both correctness and the narrow performance property it intends to improve.

1. Unit-level store tests use real observable notifications and real domain-shaped payloads. They prove unrelated entity and leaf subscriptions remain silent.
1. Resource tests exercise cancellation, stale response rejection, reconnect behavior, pagination merge behavior, and error recovery without mock-heavy component snapshots.
1. List tests verify stable identity, selection changes, row data replacement, dataset switches, prepend anchoring, and recycling reset behavior.
1. Interactive web and device flows click real controls and inspect visible behavior. Browser timing is collected only for comparable warm and cold paths.
1. Runtime measurements distinguish JS notification or render counts, request counts, mount counts, elapsed wall time, and memory. A microbenchmark is never reported as device frame performance.
1. Every slice passes `bun run check`; release-facing slices additionally pass Expo production export and the relevant Maestro or browser flow.

## TanStack Query decision

TanStack Query owns request-response server cache lifecycles: request deduplication, stale and refetch policy, retries, pagination, mutation invalidation, and garbage collection. VibePad's central data is different: ordered provider streams, imperative commands, host journals, session runtimes, and local UI state. Adding Query beneath Legend-owned services, catalogs, files, or timelines would duplicate cache ownership and invalidation.

Keep TanStack Query outside the core control plane. Reconsider it for an independently cached, request-response surface such as a public marketplace, documentation search, or release metadata, or when a third-party integration already requires its Query client.

## Current evidence log

| Slice                   | Before                                                                                | After                                                                                             | Correctness evidence                                                                                                                                           | Interactive evidence                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Workspace normalization | Reconstructed workspace snapshot was the only UI shape.                               | Projects, sessions, and providers are keyed registries.                                           | Updating session A notified A once and session B zero times.                                                                                                   | Pending narrow UI selector migration.                                                 |
| Settings ownership      | One changing context value carried settings, persistence status, errors, and actions. | One stable context carries a Legend store; consumers subscribe to the required preference leaves. | A timeline update emitted one timeline notification and zero voice notifications; queued writes remained ordered; late hydration preserved a newer local edit. | Full repository gate passed with 69 tests; interactive settings flow remains pending. |
| Timeline paging         | A full historical timeline was loaded for every session activation.                   | Latest-page bootstrap plus older-page prepend is available.                                       | Timeline projection and paging tests pass.                                                                                                                     | Prior real Codex host flow passed; comparative device evidence remains pending.       |
