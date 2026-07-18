// ============================================================
// LiveWaveform.swift — swiftcn-ui (Audio)
// Depends on: Theme/ · Audio/AudioLevelProvider.swift
//
// SwiftUI port of elevenlabs-ui's `LiveWaveform`: a real-time
// canvas waveform with static (mirrored) and scrolling modes,
// a synthesized processing animation that blends out of the
// last live frame, a fade-to-idle transition, a dotted idle
// baseline, and faded edges. Upstream part: LiveWaveform.
//
// Intentional adaptations, in the MessageScroller tradition:
// - `SCAudioLevelProvider` polling replaces the embedded
//   `getUserMedia`/`AnalyserNode` capture. The `deviceId`,
//   `fftSize`, and `smoothingTimeConstant` props plus the
//   `onError`/`onStreamReady`/`onStreamEnd` stream callbacks
//   are engine concerns and move to the provider.
// - `TimelineView(.animation)` + `Canvas` replace the
//   requestAnimationFrame/canvas loop. Upstream steps its
//   processing and fade animations by per-frame constants at
//   ~60 fps (0.03, 0.02, 0.03 per frame); the port integrates
//   the same speeds per second (1.8/s, 1.2/s, 1.8/s) so the
//   motion is refresh-rate independent.
// - `theme.foreground` replaces the CSS `currentColor` default
//   for `barColor`; the edge fade is the same destination-out
//   gradient; `height` is a fixed point value (`nil` fills the
//   proposal, upstream's percentage heights).
// ============================================================
import SwiftUI

// MARK: - Mode

/// How bars are laid out — upstream's `mode` prop.
nonisolated public enum SCLiveWaveformMode: CaseIterable, Hashable, Sendable {
  /// New levels scroll in from the trailing edge, oldest falling off.
  case scrolling
  /// Bars sit in fixed positions, mirrored around the center (the default).
  case `static`
}

// MARK: - Component

/// A real-time audio waveform — elevenlabs-ui's `LiveWaveform`. While
/// `active`, it polls the injected level provider; while `processing`, it
/// synthesizes a gentle multi-wave animation that blends out of the last
/// live frame; idle, it fades the bars down to a dotted baseline.
///
///     SCLiveWaveform(active: isRecording, levels: microphoneLevels)
///
///     SCLiveWaveform(
///         active: isRecording,
///         processing: isTranscribing,
///         levels: microphoneLevels,
///         barWidth: 3,
///         barGap: 2,
///         mode: .scrolling
///     )
public struct SCLiveWaveform: View {
  @Environment(\.theme) private var theme
  @State private var model = SCLiveWaveformModel()

  var active: Bool
  var processing: Bool
  var levels: (any SCAudioLevelProvider)?
  var barWidth: CGFloat
  var barHeight: CGFloat
  var barGap: CGFloat
  var barRadius: CGFloat
  var barColor: Color?
  var fadeEdges: Bool
  var fadeWidth: CGFloat
  var height: CGFloat?
  var sensitivity: Double
  var historySize: Int
  var updateRate: TimeInterval
  var mode: SCLiveWaveformMode

  /// - Parameters:
  ///   - active: Renders live levels from `levels` while true.
  ///   - processing: Plays the synthesized processing animation while
  ///     true (and `active` is false).
  ///   - levels: The audio engine feeding normalized bar levels.
  ///   - barWidth: Width of each bar in points.
  ///   - barHeight: Minimum bar height in points.
  ///   - barGap: Gap between bars in points.
  ///   - barRadius: Bar corner radius in points.
  ///   - barColor: Bar color; `nil` uses the theme foreground.
  ///   - fadeEdges: Fades the waveform out toward both edges.
  ///   - fadeWidth: Width of each edge fade in points.
  ///   - height: Fixed waveform height; `nil` fills the proposed height.
  ///   - sensitivity: Multiplier applied to sampled levels.
  ///   - historySize: Samples kept in scrolling mode.
  ///   - updateRate: Minimum seconds between level samples (0.03 ≈
  ///     upstream's 30 ms).
  ///   - mode: Static mirrored bars or a scrolling history.
  public init(
    active: Bool = false,
    processing: Bool = false,
    levels: (any SCAudioLevelProvider)? = nil,
    barWidth: CGFloat = 3,
    barHeight: CGFloat = 4,
    barGap: CGFloat = 1,
    barRadius: CGFloat = 1.5,
    barColor: Color? = nil,
    fadeEdges: Bool = true,
    fadeWidth: CGFloat = 24,
    height: CGFloat? = 64,
    sensitivity: Double = 1,
    historySize: Int = 60,
    updateRate: TimeInterval = 0.03,
    mode: SCLiveWaveformMode = .static
  ) {
    self.active = active
    self.processing = processing
    self.levels = levels
    self.barWidth = barWidth
    self.barHeight = barHeight
    self.barGap = barGap
    self.barRadius = barRadius
    self.barColor = barColor
    self.fadeEdges = fadeEdges
    self.fadeWidth = fadeWidth
    self.height = height
    self.sensitivity = sensitivity
    self.historySize = historySize
    self.updateRate = updateRate
    self.mode = mode
  }

  public var body: some View {
    ZStack {
      if !active && !processing {
        idleBaseline
      }
      TimelineView(.animation) { timeline in
        Canvas { context, size in
          let bars = model.advance(to: timeline.date, width: size.width, using: configuration)
          draw(bars, in: &context, size: size)
        }
      }
    }
    .frame(height: height)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityText)
  }

  private var configuration: SCLiveWaveformModel.Configuration {
    SCLiveWaveformModel.Configuration(
      active: active,
      processing: processing,
      levels: levels,
      barWidth: barWidth,
      barGap: barGap,
      sensitivity: sensitivity,
      historySize: historySize,
      updateRate: updateRate,
      mode: mode
    )
  }

  /// Upstream's `aria-label`, verbatim.
  private var accessibilityText: String {
    if active { return "Live audio waveform" }
    if processing { return "Processing audio" }
    return "Audio waveform idle"
  }

  // MARK: Drawing

  private func draw(_ bars: [Double], in context: inout GraphicsContext, size: CGSize) {
    let step = barWidth + barGap
    let barCount = Int(size.width / step)
    let centerY = size.height / 2
    let color = barColor ?? theme.foreground

    for index in 0..<min(barCount, bars.count) {
      // Scrolling mode anchors the newest sample at the trailing edge.
      let value: Double
      let x: CGFloat
      switch mode {
      case .static:
        value = bars[index]
        x = CGFloat(index) * step
      case .scrolling:
        value = bars[bars.count - 1 - index]
        x = size.width - CGFloat(index + 1) * step
      }
      let renderedValue = value == 0 ? 0.1 : value
      let renderedHeight = max(barHeight, renderedValue * size.height * 0.8)
      let rect = CGRect(x: x, y: centerY - renderedHeight / 2, width: barWidth, height: renderedHeight)
      let alpha = 0.4 + renderedValue * 0.6
      let path =
        barRadius > 0
        ? Path(roundedRect: rect, cornerRadius: barRadius, style: .continuous)
        : Path(rect)
      context.fill(path, with: .color(color.opacity(alpha)))
    }

    if fadeEdges && fadeWidth > 0 && size.width > 0 {
      eraseEdges(in: &context, size: size)
    }
  }

  /// Upstream's destination-out edge gradient: opaque stops erase the
  /// waveform at both edges while the transparent center keeps it.
  private func eraseEdges(in context: inout GraphicsContext, size: CGSize) {
    let fadeFraction = min(0.3, fadeWidth / size.width)
    let gradient = Gradient(stops: [
      .init(color: .white, location: 0),
      .init(color: .white.opacity(0), location: fadeFraction),
      .init(color: .white.opacity(0), location: 1 - fadeFraction),
      .init(color: .white, location: 1),
    ])
    context.blendMode = .destinationOut
    context.fill(
      Path(CGRect(origin: .zero, size: size)),
      with: .linearGradient(
        gradient,
        startPoint: CGPoint(x: 0, y: size.height / 2),
        endPoint: CGPoint(x: size.width, y: size.height / 2)
      )
    )
    context.blendMode = .normal
  }

  /// The dotted resting line shown while neither active nor processing.
  private var idleBaseline: some View {
    GeometryReader { geometry in
      Path { path in
        let y = geometry.size.height / 2
        path.move(to: CGPoint(x: 0, y: y))
        path.addLine(to: CGPoint(x: geometry.size.width, y: y))
      }
      .stroke(
        theme.mutedForeground.opacity(0.2),
        style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [0.1, 6])
      )
    }
  }
}

// MARK: - Frame model

/// Per-frame waveform state, mutated inside the `Canvas` renderer the way
/// upstream mutates its refs inside requestAnimationFrame.
@MainActor
private final class SCLiveWaveformModel {
  struct Configuration {
    var active: Bool
    var processing: Bool
    var levels: (any SCAudioLevelProvider)?
    var barWidth: CGFloat
    var barGap: CGFloat
    var sensitivity: Double
    var historySize: Int
    var updateRate: TimeInterval
    var mode: SCLiveWaveformMode
  }

  private enum Phase {
    case idle
    case active
    case processing
  }

  private var history: [Double] = []
  private var staticBars: [Double] = []
  private var lastActiveData: [Double] = []
  private var processingTime: Double = 0
  private var transitionProgress: Double = 0
  private var fadeProgress: Double = 0
  private var phase = Phase.idle
  private var lastFrame: Date?
  private var lastSample = Date.distantPast

  /// Steps the animation to `date` and returns the bars to draw.
  func advance(to date: Date, width: CGFloat, using configuration: Configuration) -> [Double] {
    let dt = deltaTime(to: date)
    let barCount = max(Int(width / (configuration.barWidth + configuration.barGap)), 0)

    if configuration.active {
      enterPhase(.active)
      sampleIfDue(at: date, barCount: barCount, using: configuration)
    } else if configuration.processing {
      if phase != .processing {
        enterPhase(.processing)
      }
      stepProcessing(dt: dt, barCount: barCount, mode: configuration.mode)
    } else {
      enterPhase(.idle)
      stepFadeToIdle(dt: dt, mode: configuration.mode)
    }

    return configuration.mode == .static ? staticBars : history
  }

  private func deltaTime(to date: Date) -> Double {
    defer { lastFrame = date }
    guard let lastFrame else { return 0 }
    // Clamp long gaps (window occlusion) so animations never jump.
    return min(max(date.timeIntervalSince(lastFrame), 0), 0.1)
  }

  private func enterPhase(_ newPhase: Phase) {
    guard phase != newPhase else { return }
    phase = newPhase
    switch newPhase {
    case .processing:
      // Upstream resets its wave clock and blend whenever the
      // processing effect starts.
      processingTime = 0
      transitionProgress = 0
    case .active:
      history = []
      fadeProgress = 0
    case .idle:
      fadeProgress = 0
    }
  }

  // MARK: Live sampling

  private func sampleIfDue(at date: Date, barCount: Int, using configuration: Configuration) {
    guard date.timeIntervalSince(lastSample) >= configuration.updateRate else { return }
    lastSample = date
    guard let provider = configuration.levels else { return }

    switch configuration.mode {
    case .static:
      let halfCount = barCount / 2
      guard halfCount > 0 else { return }
      let sampled = provider.levels(bandCount: halfCount)
      let mirrored = mirroredBars(from: sampled, halfCount: halfCount, sensitivity: configuration.sensitivity)
      staticBars = mirrored
      lastActiveData = mirrored
    case .scrolling:
      let sampled = provider.levels(bandCount: 1)
      let average = Double(sampled.first ?? 0) * configuration.sensitivity
      history.append(min(1, max(0.05, average)))
      if history.count > configuration.historySize {
        history.removeFirst(history.count - configuration.historySize)
      }
      lastActiveData = history
    }
  }

  /// Upstream's symmetric display: low bands at the center, mirrored
  /// outward to both edges.
  private func mirroredBars(from sampled: [Float], halfCount: Int, sensitivity: Double) -> [Double] {
    func value(_ index: Int) -> Double {
      let level = index < sampled.count ? Double(sampled[index]) : 0
      return max(0.05, min(1, level * sensitivity))
    }
    var bars: [Double] = []
    bars.reserveCapacity(halfCount * 2)
    for index in stride(from: halfCount - 1, through: 0, by: -1) {
      bars.append(value(index))
    }
    for index in 0..<halfCount {
      bars.append(value(index))
    }
    return bars
  }

  // MARK: Processing animation

  private func stepProcessing(dt: Double, barCount: Int, mode: SCLiveWaveformMode) {
    // 0.03 and 0.02 per upstream frame at ~60 fps, integrated per second.
    processingTime += 1.8 * dt
    transitionProgress = min(1, transitionProgress + 1.2 * dt)
    guard barCount > 0 else { return }

    var bars: [Double] = []
    bars.reserveCapacity(barCount)
    for index in 0..<barCount {
      let synthesized = processingValue(index: index, barCount: barCount, mode: mode)
      let blended = blendWithLastActive(synthesized, index: index, barCount: barCount, mode: mode)
      bars.append(max(0.05, min(1, blended)))
    }
    if mode == .static {
      staticBars = bars
    } else {
      history = bars
    }
  }

  private func processingValue(index: Int, barCount: Int, mode: SCLiveWaveformMode) -> Double {
    let combinedWave: Double
    let centerWeight: Double
    switch mode {
    case .static:
      let halfCount = Double(max(barCount / 2, 1))
      let position = (Double(index) - halfCount) / halfCount
      centerWeight = 1 - abs(position) * 0.4
      combinedWave =
        sin(processingTime * 1.5 + position * 3) * 0.25
        + sin(processingTime * 0.8 - position * 2) * 0.2
        + cos(processingTime * 2 + position) * 0.15
    case .scrolling:
      let half = Double(barCount) / 2
      let position = (Double(index) - half) / half
      centerWeight = 1 - abs(position) * 0.4
      combinedWave =
        sin(processingTime * 1.5 + Double(index) * 0.15) * 0.25
        + sin(processingTime * 0.8 - Double(index) * 0.1) * 0.2
        + cos(processingTime * 2 + Double(index) * 0.05) * 0.15
    }
    return (0.2 + combinedWave) * centerWeight
  }

  /// Blends the synthesized wave out of the last live frame while the
  /// transition is still in progress.
  private func blendWithLastActive(_ value: Double, index: Int, barCount: Int, mode: SCLiveWaveformMode) -> Double {
    guard !lastActiveData.isEmpty, transitionProgress < 1 else { return value }
    let lastIndex: Int
    switch mode {
    case .static:
      lastIndex = min(index, lastActiveData.count - 1)
    case .scrolling:
      lastIndex = min(
        Int(Double(index) / Double(barCount) * Double(lastActiveData.count)),
        lastActiveData.count - 1
      )
    }
    let lastValue = lastActiveData[lastIndex]
    return lastValue * (1 - transitionProgress) + value * transitionProgress
  }

  // MARK: Fade to idle

  private func stepFadeToIdle(dt: Double, mode: SCLiveWaveformMode) {
    let hasData = mode == .static ? !staticBars.isEmpty : !history.isEmpty
    guard hasData else { return }
    fadeProgress += 1.8 * dt
    if fadeProgress < 1 {
      let factor = 1 - fadeProgress
      if mode == .static {
        staticBars = staticBars.map { $0 * factor }
      } else {
        history = history.map { $0 * factor }
      }
    } else {
      staticBars = []
      history = []
      lastActiveData = []
    }
  }
}
