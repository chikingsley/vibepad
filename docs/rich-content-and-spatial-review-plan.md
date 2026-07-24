# Rich content and live review product set

Status: settled product brief, 2026-07-22

## Product definition

VibePad presents agent output as rich content and turns any live website into an interactive review surface. The reviewer can browse, draw, speak, scroll, and continue drawing in one review session. Send produces a compact evidence packet that preserves the visual state, annotations, transcript, timing, and target context.

The complete product set reaches a physical device build together. Implementation can land in tested vertical slices while the device-build gate covers the whole experience.

## Settled behavior

1. Streaming chat renders Markdown, including emphasis, headings, lists, links, code, blockquotes, and GFM tables.
1. Every table and code block owns a horizontal scroller inside the vertical conversation.
1. Markdown files open as rendered documents, with Source as a secondary view.
1. iPhone uses a focused document reader like the Codex app screen.
1. iPad and wide web support split, expanded, and full-screen presentations. The reviewer chooses the presentation that fits the current task.
1. Website review happens over the live website. Buttons, fields, dropdowns, scrolling, animation, and navigation remain available throughout the session.
1. Explicit Interact and Draw modes route Apple Pencil to ink while touch continues to operate the website. Finger drawing uses one finger for ink and two fingers for pan, scroll, and zoom.
1. Annotations remain in the review session until Send or an explicit Clear.
1. A cue settles about 800 ms after the latest stroke. Scroll, navigation, and state changes can finalize the current visual evidence immediately.
1. The review session records video as the source record and compiles portable keyframes, detail crops, transcript spans, and structured metadata.

## 1. Streaming Markdown

Use [`react-native-streamdown`](https://github.com/software-mansion-labs/react-native-streamdown) for the active streaming tail. It combines `remend` with `react-native-enriched-markdown`, including streaming GFM tables and background parsing through Worklets.

VibePad already carries `react-native-worklets` 0.10.0. The integration adds Worklets Bundle Mode, forwards the `remend` import in Babel, and composes the Bundle Mode resolver with the existing NativeWind Metro configuration.

Add one shared `RichMarkdown` boundary:

- active streaming tail: `StreamdownText`;
- completed timeline block: the enriched static renderer;
- Markdown file: the enriched static renderer in a document surface;
- plain timeline block: native text;
- project-file link: open the file surface at the optional line;
- Markdown-file link: open the rendered document first;
- website link: open the browser artifact surface.

This keeps incomplete streaming syntax stable while finished content avoids continuous stream processing. Expo native and Expo web both belong in the acceptance matrix.

## 2. Artifact presentations

Use one artifact state with three presentations:

```ts
type ArtifactPresentation = "split" | "expanded" | "fullScreen";
```

- `split` keeps session and artifact visible together.
- `expanded` gives the artifact most of the workbench while retaining session access.
- `fullScreen` creates the immersive review surface with a compact Done control.

Changing presentation preserves URL, scroll position, page state, annotations, recording state, and draft transcript. iPhone defaults to `fullScreen` for a Markdown document. iPad defaults to the current workbench presentation and offers full-screen review as a primary action.

## 3. Live drawing and pointer routing

The current `BrowserViewFrame` remains mounted beneath the transparent `FeedbackOverlay`. A native pointer router provides the iPad interaction contract:

- Interact mode routes Pencil and touch to the live website.
- Draw mode routes Pencil to ink and touch to the live website.
- Finger Draw routes one touch to ink and a two-touch gesture to website navigation.
- Toolbar, microphone, model, mode, Undo, Clear, and Send controls remain active.

The pointer router is a required native integration spike. Its physical-iPad proof must cover Pencil drawing during finger scrolling, finger drawing, two-finger page movement, dropdown interaction, and uninterrupted ink rendering.

## 4. Annotation persistence across scrolling

Viewport-normalized points become durable review anchors:

- document anchor: page coordinates plus scroll and visual-viewport state;
- element anchor: DOM target plus offsets inside its captured bounds;
- scene anchor: URL, browser target, page revision, and video timestamp for temporary states such as an open menu or animation frame.

Document-anchored strokes move with the page. Scrolling can move a marked region offscreen; scrolling back reveals the stroke in its original location. A cue rail shows every cue group as a thumbnail and returns the browser to its anchor when selected.

The recorder keeps the last composite frame around every stroke. When scrolling starts before the 800 ms settle timer, the compiler chooses the latest frame after the stroke and before page movement. The marked state therefore survives even when its page region immediately leaves the viewport.

Nested scrollers and temporary DOM states use element or scene anchors. The scene keyframe preserves the exact visual state while the vector cue preserves the reviewer's intent.

## 5. Review recording compiler

Record from the first review action or microphone start through Send. The source record contains the visible artifact, composited annotation overlay, event times, and microphone audio. Store the raw MP4 on the host for replay and provider-native video delivery.

The compiler produces:

1. a frame after each settled annotation cue;
1. a frame immediately before a marked region scrolls away;
1. a frame after navigation, dropdown, modal, or responsive-state changes settle;
1. a final frame at Send;
1. a full-page context master with document-anchored annotations for each URL or major page revision;
1. a viewport image and an annotation-centered high-resolution crop for each cue;
1. transcript spans aligned to cue, interaction, and frame timestamps.

UI event markers supply the strongest frame candidates. FFmpeg scene detection, `mpdecimate`, perceptual hashes, or SSIM then remove visually redundant frames and retain meaningful state changes. Scene thresholds supplement event markers because small text or control changes can carry substantial meaning.

For long pages, retain a full-resolution page master, create a scaled overview, and tile the master at readable resolution. Delivery includes the overview and the tiles touched by annotations. This gives the agent full-page context and legible local detail at a predictable token cost.

## 6. One capture contract

The product exposes one review-recorder contract with platform implementations:

```ts
interface ReviewRecorder {
  start(input: ReviewStartInput): Promise<void>;
  mark(event: ReviewEvent): void;
  captureFrame(reason: ReviewFrameReason): Promise<ReviewFrame>;
  finish(): Promise<ReviewRecording>;
}
```

- The current iOS 17 deployment target uses a ReplayKit-backed Expo module for the composited review recording and `react-native-view-shot` for exact still frames. Known artifact bounds allow the compiler to crop split and expanded presentations.
- Web and the host browser use Chrome page frames plus timestamped vector overlays; the compiler composites them and muxes the separately captured microphone audio.

Every implementation yields the same `ReviewRecording` and `ReviewFrame` records. Provider delivery remains independent from capture mechanics.

## 7. Review packet and provider delivery

```ts
interface ReviewPacket {
  artifact: ArtifactReference;
  presentation: ArtifactPresentation;
  recordingAssetId: string;
  fullPageContexts: readonly ReviewPageContext[];
  cues: readonly AnchoredReviewCue[];
  frames: readonly ReviewFrame[];
  transcript: readonly TimedTranscriptSpan[];
  sendProfile: ReviewSendProfile;
}
```

Video is the replayable source record. Ordered keyframes and crops are the portable model input.

- The Codex and OpenAI adapters send local images plus the compact transcript and review manifest.
- OpenCode delivery follows the selected provider capability map and always has the image packet available.
- Gemini delivery can include the raw video as a provider-native video input while retaining keyframes for precise visual references.
- The chat timeline shows the generated attachments, transcript, and a link back to the complete review recording.

The delivery router budgets images by cue importance. Each annotated cue receives its viewport and detail crop. The full-page overview supplies orientation, and additional tiles enter the prompt when the review or agent requests them.

## 8. Quick Edit and broader surfaces

Quick Edit is a send profile over the same review packet. It chooses model, effort, agent, instruction template, and automatic execution behavior. The reviewer may change the profile during recording; Send stores the final profile with the packet.

Markdown annotation, code annotation, simulator markup, and remote-device markup reuse the recorder, anchor, compiler, and delivery contracts after website review proves them. They remain named follow-on surfaces inside the same architecture.

## Implementation and proof loop

Build the product set through five internal slices:

1. streaming Markdown, tables, links, and rendered Markdown files;
1. split, expanded, and full-screen artifact presentations;
1. live website drawing, pointer arbitration, and persistent anchors;
1. review recording, keyframe compilation, transcript alignment, and cue rail;
1. provider delivery, Quick Edit profile, timeline attachments, and replay.

Each slice uses four independent roles:

1. implementation owner builds the vertical slice;
1. adversarial product and code reviewer tests assumptions and edge cases;
1. runtime verifier exercises the real app and captures visual evidence;
1. integration owner resolves findings and reruns the complete gate.

The final gate covers focused protocol tests, host tests, client type checks, lint, web runtime proof, iPad simulator proof, and one physical-device build of the complete feature set. The device build starts after the product and runtime reviews close their findings.
