// ============================================================
// SpeechInput.swift — swiftcn-ui (Audio)
// Depends on: Theme/ · Button.swift
//
// SwiftUI port of elevenlabs-ui's `SpeechInput` compound
// component: an idle microphone button that expands into a
// recording bar with a cancel (X) control, a live transcript
// preview, and a stop/confirm control, in three sizes.
// Upstream parts: SpeechInput · SpeechInputRecordButton ·
// SpeechInputPreview · SpeechInputCancelButton ·
// useSpeechInput · SpeechInputData, backed by the `use-scribe`
// hook.
//
// Intentional adaptations, in the MessageScroller tradition:
// - `SCSpeechInputSession` replaces `useScribe` + `getToken`:
//   the protocol mirrors exactly the hook surface the component
//   consumes (status, partial transcript, committed transcripts,
//   error, connect/disconnect/clearTranscripts) while token
//   acquisition, model/VAD/microphone configuration, and the
//   Scribe error taxonomy (`onAuthError`, `onQuotaExceededError`,
//   …) live in the conforming engine. No ElevenLabs SDK is
//   required; wire in any realtime transcriber.
// - `SCSpeechInputContext` in the SwiftUI environment replaces
//   the React context and the `useSpeechInput` hook.
// - A pulsing primary circle replaces the `Skeleton` connecting
//   dot; SF Symbols replace the lucide `MicIcon`/`SquareIcon`/
//   `XIcon`; animation modifiers replace framer-motion and the
//   CSS width/opacity transitions; the recording chrome uses
//   one `theme.background` fill (upstream additionally swaps to
//   `bg-muted` in dark mode).
// ============================================================
import SwiftUI

// MARK: - Status

/// Session lifecycle — the `use-scribe` hook's `ScribeStatus`.
nonisolated public enum SCSpeechInputStatus: String, CaseIterable, Hashable, Sendable {
  case disconnected
  case connecting
  case connected
  case transcribing
  case error
}

// MARK: - Data

/// Transcript snapshot passed to every `SCSpeechInput` callback —
/// upstream's `SpeechInputData`.
nonisolated public struct SCSpeechInputData: Hashable, Sendable {
  /// The current partial (in-progress) transcript.
  public var partialTranscript: String
  /// All committed (finalized) transcripts, oldest first.
  public var committedTranscripts: [String]

  /// The full transcript: committed segments joined with spaces, then the
  /// partial transcript — upstream's `buildTranscript`.
  public var transcript: String {
    let joined = committedTranscripts.joined(separator: " ")
    let committed = joined.trimmingCharacters(in: .whitespacesAndNewlines)
    let partial = partialTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    if !committed.isEmpty && !partial.isEmpty {
      return committed + " " + partial
    }
    return committed.isEmpty ? partial : committed
  }

  /// Creates a transcript snapshot.
  public init(partialTranscript: String = "", committedTranscripts: [String] = []) {
    self.partialTranscript = partialTranscript
    self.committedTranscripts = committedTranscripts
  }
}

// MARK: - Session

/// The speech-engine seam behind `SCSpeechInput` — the surface of
/// upstream's `useScribe` hook that the component consumes, as an
/// observable protocol. Conform with any realtime transcriber
/// (Speech.framework, VoiceFlowKit, a WebSocket service, …); the engine
/// owns token acquisition, audio capture, and service configuration.
///
///     @Observable final class ScribeSession: SCSpeechInputSession {
///         private(set) var status = SCSpeechInputStatus.disconnected
///         private(set) var partialTranscript = ""
///         private(set) var committedTranscripts: [String] = []
///         private(set) var error: String?
///         func start() async throws { /* fetch token, connect, stream */ }
///         func stop() { /* disconnect */ }
///         func clearTranscripts() { /* reset transcript state */ }
///     }
@MainActor
public protocol SCSpeechInputSession: AnyObject, Observable {
  /// Connection state — `useScribe().status`.
  var status: SCSpeechInputStatus { get }
  /// The in-progress transcript — `useScribe().partialTranscript`.
  var partialTranscript: String { get }
  /// Finalized transcript segments, oldest first — the text of
  /// `useScribe().committedTranscripts`.
  var committedTranscripts: [String] { get }
  /// The latest error message, if any — `useScribe().error`.
  var error: String? { get }
  /// Acquires credentials and connects — `getToken` + `scribe.connect`.
  /// Throwing reports the failure through `SCSpeechInput`'s `onError`.
  func start() async throws
  /// Disconnects and stops capture — `scribe.disconnect`.
  func stop()
  /// Clears partial and committed transcripts — `scribe.clearTranscripts`.
  func clearTranscripts()
}

extension SCSpeechInputSession {
  /// Whether the session is live — `useScribe().isConnected`.
  public var isConnected: Bool {
    status == .connected || status == .transcribing
  }

  /// Whether a connection attempt is in flight.
  public var isConnecting: Bool {
    status == .connecting
  }

  /// The current transcript snapshot.
  public var data: SCSpeechInputData {
    SCSpeechInputData(
      partialTranscript: partialTranscript,
      committedTranscripts: committedTranscripts
    )
  }
}

// MARK: - Size

/// Control sizing — upstream's `size` variant (36/32/40 pt squares).
nonisolated public enum SCSpeechInputSize: CaseIterable, Hashable, Sendable {
  case `default`
  case sm
  case lg
}

extension SCSpeechInputSize {
  /// The square icon-button size for this variant.
  var iconButtonSize: SCButtonSize {
    switch self {
    case .default: .icon
    case .sm: .iconSM
    case .lg: .iconLG
    }
  }
}

// MARK: - Context

/// What `SCSpeechInput` publishes to its parts through the environment —
/// upstream's `useSpeechInput` context value. Read it from custom parts
/// via `@Environment(\.scSpeechInput)`.
public struct SCSpeechInputContext {
  /// Whether the session is live.
  public var isConnected: Bool
  /// Whether a connection attempt is in flight.
  public var isConnecting: Bool
  /// The in-progress transcript.
  public var partialTranscript: String
  /// Finalized transcript segments, oldest first.
  public var committedTranscripts: [String]
  /// Committed plus partial transcript, joined.
  public var transcript: String
  /// The latest session error message, if any.
  public var error: String?
  /// The size variant shared by the compound parts.
  public var size: SCSpeechInputSize
  /// Starts recording.
  public var start: @MainActor () -> Void
  /// Stops recording, keeping the transcript.
  public var stop: @MainActor () -> Void
  /// Cancels recording, discarding the transcript.
  public var cancel: @MainActor () -> Void
}

private struct SCSpeechInputContextKey: EnvironmentKey {
  static let defaultValue: SCSpeechInputContext? = nil
}

extension EnvironmentValues {
  /// The nearest enclosing `SCSpeechInput` context — upstream's
  /// `useSpeechInput`. `nil` outside an `SCSpeechInput`.
  public var scSpeechInput: SCSpeechInputContext? {
    get { self[SCSpeechInputContextKey.self] }
    set { self[SCSpeechInputContextKey.self] = newValue }
  }
}

// MARK: - Root

/// A compact speech-to-text control — elevenlabs-ui's `SpeechInput`. Idle,
/// it is a lone microphone button; recording, it expands into a bar with
/// cancel, live transcript preview, and stop controls. The transcription
/// engine is injected as an `SCSpeechInputSession`.
///
///     SCSpeechInput(
///         session: scribeSession,
///         onChange: { draft = baseline + $0.transcript },
///         onCancel: { _ in draft = baseline }
///     ) {
///         SCSpeechInputCancelButton()
///         SCSpeechInputPreview()
///         SCSpeechInputRecordButton()
///     }
public struct SCSpeechInput<Content: View>: View {
  @Environment(\.theme) private var theme
  @State private var coordinator = SCSpeechInputCoordinator()

  var session: any SCSpeechInputSession
  var size: SCSpeechInputSize
  var onChange: ((SCSpeechInputData) -> Void)?
  var onStart: ((SCSpeechInputData) -> Void)?
  var onStop: ((SCSpeechInputData) -> Void)?
  var onCancel: ((SCSpeechInputData) -> Void)?
  var onError: ((any Error) -> Void)?
  var content: Content

  /// - Parameters:
  ///   - session: The speech engine (upstream's `useScribe` + `getToken`).
  ///   - size: Size variant shared by the compound parts.
  ///   - onChange: Called whenever the transcript changes.
  ///   - onStart: Called when recording starts.
  ///   - onStop: Called when recording stops.
  ///   - onCancel: Called when recording is cancelled, with the
  ///     discarded transcript.
  ///   - onError: Called when starting the session fails.
  ///   - content: The compound parts, usually cancel + preview + record.
  public init(
    session: any SCSpeechInputSession,
    size: SCSpeechInputSize = .default,
    onChange: ((SCSpeechInputData) -> Void)? = nil,
    onStart: ((SCSpeechInputData) -> Void)? = nil,
    onStop: ((SCSpeechInputData) -> Void)? = nil,
    onCancel: ((SCSpeechInputData) -> Void)? = nil,
    onError: ((any Error) -> Void)? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.session = session
    self.size = size
    self.onChange = onChange
    self.onStart = onStart
    self.onStop = onStop
    self.onCancel = onCancel
    self.onError = onError
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: 0) {
      content
    }
    .background { chrome }
    .animation(.easeOut(duration: 0.2), value: session.isConnected)
    .environment(\.scSpeechInput, context)
    .onChange(of: session.data) { _, data in
      // Upstream fires onChange from transcript events only, never
      // from the reset performed by start/cancel.
      guard !(data.partialTranscript.isEmpty && data.committedTranscripts.isEmpty) else { return }
      onChange?(data)
    }
    .onDisappear {
      coordinator.generation += 1
      session.stop()
    }
  }

  /// The recording chrome: background fill, 1 pt inset border, and a
  /// hairline shadow, shown only while connected.
  @ViewBuilder private var chrome: some View {
    if session.isConnected {
      let shape = RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
      shape
        .fill(theme.background)
        .overlay(shape.strokeBorder(theme.input, lineWidth: 1))
        .shadow(color: .black.opacity(0.05), radius: 1, x: 0, y: 1)
        .transition(.opacity)
    }
  }

  private var context: SCSpeechInputContext {
    SCSpeechInputContext(
      isConnected: session.isConnected,
      isConnecting: session.isConnecting,
      partialTranscript: session.partialTranscript,
      committedTranscripts: session.committedTranscripts,
      transcript: session.data.transcript,
      error: session.error,
      size: size,
      start: start,
      stop: stop,
      cancel: cancel
    )
  }

  // MARK: Actions

  /// Upstream's `start`: reset transcripts, connect, and report — with a
  /// generation guard so a superseded start disconnects itself.
  private func start() {
    coordinator.generation += 1
    let generation = coordinator.generation
    let coordinator = coordinator
    let session = session
    let onStart = onStart
    let onError = onError
    session.clearTranscripts()
    Task { @MainActor in
      do {
        try await session.start()
        guard coordinator.generation == generation else {
          session.stop()
          return
        }
        onStart?(session.data)
      } catch {
        guard coordinator.generation == generation else { return }
        onError?(error)
      }
    }
  }

  /// Upstream's `stop`: disconnect and hand back the final transcript.
  private func stop() {
    coordinator.generation += 1
    session.stop()
    onStop?(session.data)
  }

  /// Upstream's `cancel`: disconnect, discard the transcript, and hand
  /// the discarded snapshot to `onCancel`.
  private func cancel() {
    coordinator.generation += 1
    let data = session.data
    session.stop()
    session.clearTranscripts()
    onCancel?(data)
  }
}

/// Reference-typed start-generation counter (upstream's
/// `startRequestIdRef`).
@MainActor
private final class SCSpeechInputCoordinator {
  var generation = 0
}

// MARK: - Record button

/// Toggles recording — upstream's `SpeechInputRecordButton`. Shows a
/// microphone when idle, a pulsing dot while connecting, and a stop
/// square while recording.
///
///     SCSpeechInputRecordButton()
public struct SCSpeechInputRecordButton: View {
  @Environment(\.scSpeechInput) private var speechInput
  @Environment(\.theme) private var theme

  var variant: SCButtonVariant
  var disabled: Bool?
  var action: (() -> Void)?

  /// - Parameters:
  ///   - variant: Button variant (ghost, as upstream).
  ///   - disabled: Overrides the automatic disabled-while-connecting.
  ///   - action: Extra handler invoked after toggling (`onClick`).
  public init(
    variant: SCButtonVariant = .ghost,
    disabled: Bool? = nil,
    action: (() -> Void)? = nil
  ) {
    self.variant = variant
    self.disabled = disabled
    self.action = action
  }

  private enum Phase: Hashable {
    case idle
    case connecting
    case connected
  }

  public var body: some View {
    if let context = speechInput {
      button(context)
    }
  }

  private func button(_ context: SCSpeechInputContext) -> some View {
    let phase: Phase =
      context.isConnecting ? .connecting : context.isConnected ? .connected : .idle
    return Button {
      if context.isConnected {
        context.stop()
      } else {
        context.start()
      }
      action?()
    } label: {
      ZStack {
        connectingDot(active: phase == .connecting)
        icon("square.fill", shown: phase == .connected)
          .foregroundStyle(theme.destructive)
        icon("mic", shown: phase == .idle)
      }
    }
    .buttonStyle(.sc(variant, size: context.size.iconButtonSize))
    .disabled(disabled ?? context.isConnecting)
    .scaleEffect(context.isConnected ? 0.8 : 1)
    .animation(.easeOut(duration: 0.2), value: phase)
    .accessibilityLabel(context.isConnected ? "Stop recording" : "Start recording")
  }

  /// The `Skeleton` connecting indicator, adapted to a pulsing circle.
  private func connectingDot(active: Bool) -> some View {
    Circle()
      .fill(active ? theme.primary : Color.clear)
      .frame(width: 16, height: 16)
      .scaleEffect(active ? 0.9 : 0.6)
      .modifier(SCSpeechInputPulse(active: active))
  }

  private func icon(_ systemImage: String, shown: Bool) -> some View {
    Image(systemName: systemImage)
      .font(.system(size: 14, weight: .medium))
      .opacity(shown ? 1 : 0)
      .scaleEffect(shown ? 1 : 0.6)
  }
}

/// The `animate-pulse` opacity cycle used while connecting.
private struct SCSpeechInputPulse: ViewModifier {
  var active: Bool
  @State private var dimmed = false

  func body(content: Content) -> some View {
    content
      .opacity(active && dimmed ? 0.5 : 1)
      .onChange(of: active, initial: true) { _, isActive in
        if isActive {
          withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
            dimmed = true
          }
        } else {
          withAnimation(.easeOut(duration: 0.2)) {
            dimmed = false
          }
        }
      }
  }
}

// MARK: - Preview part

/// The live transcript strip revealed while recording — upstream's
/// `SpeechInputPreview`. Shows the placeholder in italics until text
/// arrives, keeps the newest words pinned to the trailing edge, and fades
/// both ends.
///
///     SCSpeechInputPreview(placeholder: "Listening...")
public struct SCSpeechInputPreview: View {
  @Environment(\.scSpeechInput) private var speechInput
  @Environment(\.theme) private var theme

  var placeholder: String

  /// - Parameter placeholder: Text shown before any transcript arrives.
  public init(placeholder: String = "Listening...") {
    self.placeholder = placeholder
  }

  /// Upstream's `w-28` reveal width.
  private static let revealWidth: CGFloat = 112

  public var body: some View {
    if let context = speechInput {
      strip(context)
    }
  }

  private func strip(_ context: SCSpeechInputContext) -> some View {
    let showPlaceholder = context.transcript
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .isEmpty
    let displayText = context.transcript.isEmpty ? placeholder : context.transcript
    return Text(displayText)
      .font(.subheadline)
      .italic(showPlaceholder)
      .foregroundStyle(theme.mutedForeground)
      .lineLimit(1)
      .fixedSize()
      .padding(.horizontal, 4)
      .frame(width: context.isConnected ? Self.revealWidth : 0, alignment: .trailing)
      .clipped()
      .mask { edgeFade }
      .opacity(context.isConnected ? 1 : 0)
      .allowsHitTesting(false)
      .help(displayText)
      .accessibilityHidden(!context.isConnected)
      .animation(.easeOut(duration: 0.2), value: context.isConnected)
  }

  /// Upstream's 10 pt mask-image fade at both ends of the strip.
  private var edgeFade: LinearGradient {
    let inset = 10.0 / Self.revealWidth
    return LinearGradient(
      stops: [
        .init(color: .clear, location: 0),
        .init(color: .black, location: inset),
        .init(color: .black, location: 1 - inset),
        .init(color: .clear, location: 1),
      ],
      startPoint: .leading,
      endPoint: .trailing
    )
  }
}

// MARK: - Cancel button

/// Cancels recording and discards the transcript — upstream's
/// `SpeechInputCancelButton`. Hidden until recording is live.
///
///     SCSpeechInputCancelButton()
public struct SCSpeechInputCancelButton: View {
  @Environment(\.scSpeechInput) private var speechInput

  var variant: SCButtonVariant
  var action: (() -> Void)?

  /// - Parameters:
  ///   - variant: Button variant (ghost, as upstream).
  ///   - action: Extra handler invoked after cancelling (`onClick`).
  public init(variant: SCButtonVariant = .ghost, action: (() -> Void)? = nil) {
    self.variant = variant
    self.action = action
  }

  public var body: some View {
    if let context = speechInput {
      button(context)
    }
  }

  private func button(_ context: SCSpeechInputContext) -> some View {
    Button {
      context.cancel()
      action?()
    } label: {
      Image(systemName: "xmark")
        .font(.system(size: 11, weight: .semibold))
    }
    .buttonStyle(.sc(variant, size: context.size.iconButtonSize))
    .scaleEffect(context.isConnected ? 0.8 : 1)
    .frame(width: context.isConnected ? nil : 0)
    .clipped()
    .opacity(context.isConnected ? 1 : 0)
    .allowsHitTesting(context.isConnected)
    .accessibilityHidden(!context.isConnected)
    .accessibilityLabel("Cancel recording")
    .animation(.easeOut(duration: 0.2), value: context.isConnected)
  }
}
