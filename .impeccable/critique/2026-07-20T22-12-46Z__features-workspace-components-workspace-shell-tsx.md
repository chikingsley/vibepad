---
target: VibePad landscape workspace shell
total_score: 21
p0_count: 0
p1_count: 4
timestamp: 2026-07-20T22-12-46Z
slug: features-workspace-components-workspace-shell-tsx
---

# VibePad Workspace Shell Critique

Method: dual-agent (A: impeccable_design_review · B: impeccable_detector)

## Design Health Score

| #         | Heuristic                       |     Score | Key issue                                                                                                                                                        |
| --------- | ------------------------------- | --------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     |         3 | Session, host, work, and mode states are visible; action-level preview failures and several color-only states remain weak.                                       |
| 2         | Match System / Real World       |         3 | Workspace, session, chat, browser, files, and changes use familiar metaphors; unlabeled surface controls still require interpretation.                           |
| 3         | User Control and Freedom        |         3 | Sidebar, tabs, browser navigation, workbench, and review cancellation have exits; undo, restore, and keyboard escape paths remain incomplete.                    |
| 4         | Consistency and Standards       |         2 | The shell misses native touch sizes and tab semantics, mixes selection colors, and regressed the confirmed labeled New Session control into a detached icon.     |
| 5         | Error Prevention                |         2 | Disabled states and send guards help; tiny adjacent controls and silent browser-action failures invite mistakes.                                                 |
| 6         | Recognition Rather Than Recall  |         2 | Session and preview-mode labels are visible; four session surfaces are icon-only, inactive tab close relies on hover, and several states reduce to dots or tint. |
| 7         | Flexibility and Efficiency      |         1 | The sidebar advertises Command-K while the trigger and keyboard path are inert; the workbench split is fixed.                                                    |
| 8         | Aesthetic and Minimalist Design |         2 | The panel structure is calm, but the header fragments into control islands and preview chrome consumes too much landscape height.                                |
| 9         | Error Recovery                  |         2 | Coarse recovery exists for timeline, composer, and browser failure; many preview actions discard rejected promises without action-specific feedback.             |
| 10        | Help and Documentation          |         1 | The shell exposes little contextual help, shortcut discovery, onboarding, or explanation for unfamiliar controls.                                                |
| **Total** |                                 | **21/40** | **Acceptable foundation; significant correction required before release.**                                                                                       |

## Anti-Patterns Verdict

### LLM assessment

The shell avoids generic AI landing-page slop. It has a credible coding-workbench structure and restrained surfaces. Its failure mode is product slop: a web-dashboard density squeezed into an adaptive native surface, with tiny controls, several competing selection layers, disconnected header islands, stacked browser chrome, and at least one prominent dead affordance.

The most damaging visual regression is concrete. The confirmed control was an outlined, labeled `+ New session` button immediately after the session-tab rail. The current implementation replaces it with a detached icon-only square, weakening recognition and breaking the agreed composition.

The screenshot also mixes product chrome with the `/design/attachments` fixture. Its fixed 320-pixel detail inspector is the element labeled Capture strip. It is separate from VibePad's production bottom review tray. Presenting that fixture as settled product evidence made a component test page look like permanent application UI and created the apparent blank region to its right.

### Deterministic scan

`detect.mjs` scanned the workspace and preview component directories and returned exit code 0 with exact JSON `[]`: zero findings, zero rules, and zero locations. This is useful negative evidence. The failures here are composition, hierarchy, semantics, sizing, and state feedback rather than detector-recognizable markup clichés.

### Visual overlays

Mutable browser injection was proven in a fresh isolated Kasm slot. Detector-script loading failed because `localhost:8400` resolved inside the browser container while the live server listened on the host loopback. The settled 1280 by 633 screenshot and source inspection supplied the reliable visual fallback.

## Overall Impression

VibePad has the right large-scale model: inventory on the left, active session context in the center, and session-owned work surfaces beside it. The current shell fails at the layer users touch first. The header lacks a coherent rail, the primary New Session action is ambiguous, the preview spends too much height on controls, and the visual proof used a fixture that masqueraded as product UI. The single biggest opportunity is to establish one unmistakable hierarchy for session, surface, browser target, and interaction mode.

## What's Working

1. **Session ownership is spatially clear.** The selected workspace row, session tab, chat, and preview remain attached to one work context.
1. **Interact, Select, and Draw communicate the differentiator.** Text-plus-icon controls make the review workflow unusually legible.
1. **The structural foundation is disciplined.** Restrained surfaces, consistent panel boundaries, progressive disclosure, reduced-motion handling, and broad accessibility labels create a repairable base.

## Cognitive Load

Three of eight checks fail, producing moderate cognitive load:

- **Chunking fails:** the workspace header and preview toolbar expose long control runs.
- **Visual hierarchy fails:** session, workbench surface, browser target, and interaction mode all show simultaneous selected states with similar emphasis.
- **Minimal choices fails:** the preview navigation row alone presents back, forward, reload, URL, external open, expand, and close.

Single focus, grouping, one-at-a-time interaction, working-memory support, and progressive disclosure pass.

## Emotional Journey

- **Entry:** Calm and credible; the workspace list and active conversation establish orientation quickly.
- **Working flow:** Confidence rises when the agent output and live surface appear together.
- **Valley:** Tiny targets, stacked browser bars, ambiguous header controls, and the inert Search shortcut undermine trust.
- **Peak:** Spatial review is the strongest moment because the result stays beside the conversation.
- **Ending:** Reassurance is weak. Review submission and browser actions lack precise success or failure acknowledgement.

## Priority Issues

### P1: Rebuild the header as one coherent session rail

**Why it matters:** The active session, New Session action, workbench surfaces, host, and provider status currently read as detached islands. The icon-only plus directly regresses a confirmed requirement and forces recognition from glyph shape alone.

**Fix:** Keep this order: sidebar toggle, separator, horizontally scrollable session tabs, outlined labeled `+ New session`, grouped session-surface controls, flexible spacer, host status, provider status. Give the selected session tab a clear bounded state, retain long-title fading, reveal close on hover, focus, and touch, and define overflow behavior for several tabs.

**Suggested command:** `$impeccable layout apps/client/src/features/workspace/components/workspace-header.tsx`

### P1: Restore native touch and semantic standards

**Why it matters:** Session close is 20 pixels, browser close is 24, and many header/preview controls are 32. These miss iOS 44-point and Android 48-dp targets. Tab and selected-mode semantics are also incomplete, while inactive tab close relies on hover.

**Fix:** Preserve compact glyphs inside platform-aware hit areas, add tab and tablist roles plus selected/busy state, support keyboard focus and touch reveal, and test with VoiceOver, keyboard, and 200 percent text scaling.

**Suggested command:** `$impeccable adapt apps/client/src/features/workspace/components/workspace-shell.tsx`

### P1: Distill Preview and stop using fixture chrome as product evidence

**Why it matters:** Browser tabs, navigation, and interaction modes consume 128 pixels; with the 56-pixel workspace header, the live result begins 184 pixels down, roughly 29 percent of the captured landscape height. The selected visual target added a fixed 320-pixel Capture strip inspector from a component fixture, causing the app itself to appear obstructed.

**Fix:** Reduce Preview to two persistent rows: browser targets, then one toolbar combining navigation, URL, and the selected review mode. Move external-open, expand, and close into a compact trailing group or menu. Validate future screenshots against a neutral responsive fixture or a real project surface, and separately capture the production bottom review tray.

**Suggested command:** `$impeccable distill apps/client/src/features/preview/components/preview-surface.tsx`

### P1: Remove or complete the false Search affordance

**Why it matters:** Search and Command-K occupy the most prominent sidebar utility position, while the Pressable has no action and no keyboard handler. A dead advertised accelerator immediately damages power-user trust.

**Fix:** Wire pointer and Command-K to one search palette over projects and sessions with grouped results, arrows, Enter, Escape, and focus restoration. Hide the trigger and shortcut label until the complete interaction exists.

**Suggested command:** `$impeccable harden apps/client/src/features/workspace/components/workspace-sidebar.tsx`

### P2: Make the split responsive and acknowledge preview actions

**Why it matters:** After the 288-pixel sidebar, chat receives a fixed 38 percent of the remaining canvas, producing narrow technical prose. Preview actions frequently catch and discard rejections, leaving users unsure whether navigation, close, reload, or review submission succeeded.

**Fix:** Add a persisted per-session draggable split with useful minimum widths and a stronger default near 45/55. Collapse the sidebar when chat falls below a readable width. Track pending and failure state per preview action, preserve drafts, offer Retry, announce errors, and confirm review submission before clearing captures.

**Suggested command:** `$impeccable layout apps/client/src/features/workspace/components/session-canvas.tsx`

## Persona Red Flags

### Alex, impatient power user

Command-K is advertised but inert, the workbench split cannot be resized, inactive tab close depends on hover, and workspace-level keyboard accelerators are largely absent.

### Sam, accessibility-dependent user

Several targets fall below both platform minimums, selection state often relies on color or tiny dots, tab semantics are incomplete, and compact icons have no scalable visual label.

### Jordan, first-time VibePad user

Four icon-only workbench surfaces sit beside several different tab and selection systems. The interface gives little help distinguishing the active harness session, workbench surface, browser target, and interaction mode.

## Minor Observations

- The selected workbench icon uses hard-coded blue while the product token is green.
- `VibePad host` inside Preview repeats host context already visible in the shell.
- New browser targets open directly to Google instead of a neutral or configurable state.
- Identically truncated browser titles are difficult to distinguish.
- Back and forward correctly disable when unavailable; this behavior should become the standard for every unavailable action.

## Questions to Consider

- If precise visual feedback is the differentiator, why does the live result begin beneath 184 pixels of chrome?
- Which selection owns the strongest emphasis: session, workbench surface, browser target, or interaction mode?
- Which controls deserve persistent labels, and which can earn compact icon treatment through universal platform convention?
- What should remain visible when the user shifts from conversation into full-screen review?
