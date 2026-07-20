# Timeline rendering contract

The timeline is an activity stream, not a stack of generic tool cards. The collapsed state must answer what the agent did without making raw provider JSON the primary interface. Expansion is reserved for commands, output, patches, provider-native detail, and errors.

## Evidence baseline

This contract was checked against the products and payloads available through 2026-07-20:

- ChatGPT `26.715.31251`, including the packaged Codex webview source in the installed application and a live Codex thread.
- Codex app-server `0.144.6` through `thread/turns/list` with `itemsView: full`.
- OpenCode source `fab213312927ea64cf968832c527206e8c944f9e` (`1.18.3`) in `References/OpenCode`, plus live OpenCode `1.18.2` sessions.
- Real Codex turns containing repeated `reasoning`, `commandExecution`, `fileChange`, `webSearch`, and `agentMessage` items under the same turn ID.
- Real OpenCode `read`, `bash`, `write`, `edit`, and `apply_patch` parts. This includes current 1.18.2 `state.structured.files` and write `resource`/`existed` payloads as well as older persisted `filediff` and `files` metadata from the local OpenCode store.
- Disposable live OpenCode and Codex sessions in an isolated temporary Git project, including collapsed and expanded file changes plus a 12-second Codex command captured while running and after completion.
- Legend List 3.3.3 and the published `legend-list-best-practices` guidance from [Legend List](https://github.com/LegendApp/legend-list) and [Legend skills](https://github.com/LegendApp/legend-skills).

The previous VibePad renderer violated this contract: every tool became a bordered card, every completed call kept a colored status dot, shell output was always expanded, and Codex `fileChange` became an `apply_patch` JSON card. A single real Codex turn could therefore render dozens of unrelated-looking cards even though the provider supplied one turn ID and structured file diffs.

## Comparative behavior

| Activity                     | Codex                                                                                          | OpenCode                                                                                                   | VibePad contract                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Default tool state           | Turn activity is collapsed into a quiet one-line summary.                                      | Tools use quiet one-line triggers; details are closed by default.                                          | Borderless compact row. No success dot or completed label.                                                           |
| Running state                | Present-tense label with shimmer/progress treatment.                                           | `TextShimmer` on pending/running labels.                                                                   | Spinner plus reduced-motion-aware active label motion.                                                               |
| Context reads/searches/lists | Aggregated into turn activity such as read/searched/listed.                                    | Consecutive `read`, `glob`, `grep`, and `list` parts become one Gathered context group.                    | Group consecutive context calls; expansion lists compact actions, not raw output.                                    |
| Shell                        | Running/Ran command activity; command and output are details.                                  | `Shell <command>`; closed unless the user changes the default setting.                                     | Compact Shell or Ran row; command/output panel only after expansion.                                                 |
| File edit                    | Creating/Editing/Deleting plus path and `+/-`; each file diff starts closed.                   | Dedicated edit/write/apply-patch renderers with path and `DiffChanges`; edit and shell defaults are false. | Dedicated file-change family with action, path, aggregate and per-file `+/-`, and an inline diff/content disclosure. |
| Multiple file changes        | Summary carries file count and aggregate line counts; per-file details disclose independently. | Apply Patch has a multi-file summary and file accordions.                                                  | One event summary, then individual file rows; never one raw concatenated diff.                                       |
| Generic/MCP/agent call       | Loaded tools, integrations, and called tools are summarized by category.                       | Specialized tools where known; generic calls remain compact.                                               | Preserve category and native payload, show a calm Called or Delegated row, and expose raw detail only on demand.     |
| Failure                      | Rejected/stopped/error wording replaces success treatment.                                     | Dedicated error card/content.                                                                              | Red error affordance is allowed to be visually stronger; error text remains expandable.                              |

## Stable protocol projection

Provider adapters normalize only concepts shared by the product:

- `phase` preserves explicit commentary and final-answer boundaries when a provider supplies them. Codex maps its native `commentary` and `final_answer` phases directly. OpenCode marks only the trailing prose of a completed assistant message as a final answer; incomplete prose remains phase-unknown.
- `turnId` joins Codex activity items that belong to the same response without asking the client to inspect provider-native JSON.
- `file-change` carries one or more structured changes: action, path, optional previous path, additions, deletions, patch, and optional full content.
- `shell` carries command, output, lifecycle, optional summary, action, target, exit code, and duration.
- `tool` carries lifecycle plus optional category, action, target, and metadata.

The complete provider object remains on `TimelineItem.native`. Unknown tools do not need to be forced into a false universal abstraction; they retain input, output, metadata, error, and their provider name behind the detail disclosure.

The client then projects every provider page into the same two render blocks:

- message blocks for prose and attachments, preserving user/assistant role and known message phase;
- activity blocks for shell, context, file-change, reasoning, and tool parts, grouped by contiguous `turnId` rather than provider name.

This second projection deliberately lives in the client. Provider adapters retain their exact wire semantics while the timeline renderer stays ignorant of whether a block came from Codex or OpenCode. Interleaved OpenCode text/tool/text parts remain ordered as message/activity/message instead of being flattened into one provider-specific component.

## Rendering hierarchy

1. User messages and final assistant prose remain full timeline messages.
1. Contiguous activity with the same `turnId` becomes one collapsed work log until prose or another boundary interrupts it, regardless of provider.
1. Consecutive context parts become one Gathered context disclosure.
1. File changes, shell calls, reasoning, and generic tools use dedicated compact rows.
1. Only expanded content receives a bordered panel. Completion itself is intentionally quiet.

Long patches and command output are bounded and scrollable. Heavy bodies are not mounted until their disclosure opens.

## Performance and paging contract

History is paged before it crosses the host boundary and virtualized after it reaches the client. These are separate responsibilities:

- Codex requests three complete turns at a time through `thread/turns/list`, using the provider's opaque backward cursor for earlier turns.
- OpenCode requests provider message pages through its v2 cursor endpoint and retains the legacy message-ID cursor fallback.
- The client merges an updated head page into already-loaded history by stable item ID. It prepends one older page at a time without replacing the current backward cursor or duplicating overlap.
- `LegendList` receives timeline blocks as data, not as one large child tree. Rows have stable block keys and narrow item types, and each recycled row keys its stateful inner subtree by block ID.
- `maintainVisibleContentPosition` preserves the reader's viewport while an older page is prepended or a measured row changes height. `maintainScrollAtEnd` follows streamed growth only while the reader remains at the tail.
- Inactive session tabs retain their cached page and reading checkpoint but suspend their event stream and interaction poll. Reactivation refreshes the head page without replacing the cached view with a loading screen.

The first live Codex payload measurements on 2026-07-20 were:

| Session              | Previous full history                 | Three-turn first page              | Payload reduction |
| -------------------- | ------------------------------------- | ---------------------------------- | ----------------- |
| VibePad              | 14,634,536 bytes; 2,769 items; 5.72 s | 964,504 bytes; 250 items; 2.79 s   | 93.4%             |
| Jobkit platform main | 15,823,558 bytes; 3,792 items; 5.74 s | 1,230,164 bytes; 135 items; 3.63 s | 92.2%             |

Development-server elapsed time is recorded as evidence, not treated as a release-mode budget. The stronger result is that the initial response no longer scales with the full thread. Loading the next VibePad page transferred 758,284 bytes for 219 items at a five-turn test size; the final three-turn configuration transferred one older Ideas page in a single 177,864-byte request. A 4,500-pixel upward and 2,400-pixel downward web stress scroll left the recycled list populated with no React or Legend List warnings.

## Session opening and scrolling

Timeline opening is a versioned user preference with three explicit behaviors:

- **Latest answer** is the default. Opening a session, returning to an already-open tab, or reopening a closed tab places the viewport at the beginning of the latest final assistant answer. If old provider history has no explicit phase, the latest visible assistant prose is the conservative fallback.
- **Last position** stores a stable timeline item plus the reader's relative offset within that item for each session. It does not rely on an absolute pixel position that becomes invalid when messages stream or reflow.
- **Bottom** opens at the newest event and follows the tail.

The initial provider page includes the latest answer anchor. Earlier pages stay available in the same virtualized data set after the user requests them. Inactive tabs cannot publish layout measurements, because hidden React Native Web views can report zeroed geometry and corrupt a valid reading checkpoint. Reactivation measures the visible timeline before applying a stored anchor.

A round jump-to-latest control appears only when the reader is more than 96 pixels from the tail. Activating it scrolls to the end and resumes tail following. The scroller retains its semantic opening anchor through historical activity replay, late layout growth, and the initial content-settling window. Timeline loading state is session-owned so a newly selected session cannot inherit the previous session's ready page for one render.

Codex app-server exposes command-execution items during the live turn, but `thread/turns/list` on 0.144.6 can omit those command items after the app-server restarts even with `itemsView: full`. The host therefore appends exact native Codex events to a WAL-backed SQLite journal before downstream broadcast. On resume, the Codex adapter replays that journal into its rich turn projection, merges it with the canonical app-server snapshot, and removes only duplicate connection-local `item-N` projections. A live regression starts a real shell command, recreates both adapter and app-server, and proves the command and its output return exactly once. No fake command history is synthesized.

## Promotion gates

- Map a real Codex multi-file `fileChange` to structured file changes and prove its line counts.
- Map real OpenCode edit/apply-patch metadata without discarding `filediff` or `files`.
- Prove context aggregation, collapsed shell, expanded shell, single-file diff, multi-file diff, running, and error states.
- Capture web and landscape iPad evidence from real provider sessions.
- Profile a release or profiling build on physical landscape iPad with a long, mixed-height provider history; development-mode web timing is not the promotion measurement.
- Keep a provider-native detail path for shapes that have no specialized renderer yet.
