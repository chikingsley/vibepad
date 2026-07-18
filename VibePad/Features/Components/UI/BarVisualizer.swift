// ============================================================
// BarVisualizer.swift — swiftcn-ui (Audio)
// Depends on: Theme/ · Audio/AudioLevelProvider.swift
//
// SwiftUI port of elevenlabs-ui's `BarVisualizer`: a voice-agent
// frequency visualizer with five agent states, sequenced bar
// highlighting, a built-in demo mode, and center or bottom
// alignment. Upstream parts: BarVisualizer · AgentState ·
// useAudioVolume · useMultibandVolume · useBarAnimator.
//
// Intentional adaptations, in the MessageScroller tradition:
// - `SCAudioLevelProvider` polling replaces the `mediaStream`
//   prop plus the Web Audio `useAudioVolume`/`useMultibandVolume`
//   hooks; band splitting (`loPass`/`hiPass`, fftSize) is the
//   engine's concern.
// - The `useBarAnimator` requestAnimationFrame sequencer becomes
//   a pure function of elapsed `TimelineView` time with the same
//   sequences and intervals; deterministic hash noise replaces
//   `Math.random()` in demo mode so frames are reproducible.
// - A `height` parameter replaces upstream's `h-32` class (and
//   the className height overrides its demo uses); Capsules and
//   theme tokens replace Tailwind utilities; `animate-pulse` at
//   300 ms becomes a time-driven opacity cycle.
// ============================================================
import SwiftUI

// MARK: - Agent state

/// Voice-assistant lifecycle state — upstream's `AgentState`.
nonisolated public enum SCAgentState: String, CaseIterable, Hashable, Sendable {
  case connecting
  case initializing
  case listening
  case speaking
  case thinking
}

// MARK: - Component

/// A real-time frequency-band visualizer for voice agents —
/// elevenlabs-ui's `BarVisualizer`. Bars show live levels from the
/// injected provider (or generated demo data), while the agent state
/// drives a highlight sequence: a sweep while connecting or initializing,
/// a center blink while listening or thinking, and full primary bars
/// while speaking.
///
///     SCBarVisualizer(state: .listening, levels: microphoneLevels)
///
///     SCBarVisualizer(state: .speaking, barCount: 20, demo: true)
public struct SCBarVisualizer: View {
  @Environment(\.theme) private var theme
  @State private var epoch = Date()

  var state: SCAgentState?
  var barCount: Int
  var levels: (any SCAudioLevelProvider)?
  var minHeight: Double
  var maxHeight: Double
  var demo: Bool
  var centerAlign: Bool
  var height: CGFloat

  /// - Parameters:
  ///   - state: Voice-assistant state driving the highlight animation.
  ///   - barCount: Number of bars to display.
  ///   - levels: The audio engine feeding normalized band levels.
  ///   - minHeight: Minimum bar height as a percentage (0–100).
  ///   - maxHeight: Maximum bar height as a percentage (0–100).
  ///   - demo: Generates fake levels while speaking or listening, so no
  ///     audio engine is required.
  ///   - centerAlign: Aligns bars from the center instead of the bottom.
  ///   - height: Container height in points (upstream's `h-32`).
  public init(
    state: SCAgentState? = nil,
    barCount: Int = 15,
    levels: (any SCAudioLevelProvider)? = nil,
    minHeight: Double = 20,
    maxHeight: Double = 100,
    demo: Bool = false,
    centerAlign: Bool = false,
    height: CGFloat = 128
  ) {
    self.state = state
    self.barCount = barCount
    self.levels = levels
    self.minHeight = minHeight
    self.maxHeight = maxHeight
    self.demo = demo
    self.centerAlign = centerAlign
    self.height = height
  }

  public var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
      SCBarVisualizerBars(
        date: timeline.date,
        epoch: epoch,
        state: state,
        barCount: barCount,
        levels: levels,
        minHeight: minHeight,
        maxHeight: maxHeight,
        demo: demo,
        centerAlign: centerAlign
      )
    }
    .padding(16)
    .frame(height: height)
    .frame(maxWidth: .infinity)
    .background(containerShape.fill(theme.muted))
    .clipShape(containerShape)
    .onChange(of: state) {
      // Upstream restarts its animator sequence when the state changes.
      epoch = Date()
    }
    .onChange(of: barCount) {
      epoch = Date()
    }
  }

  private var containerShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
  }
}

// MARK: - Bars

private struct SCBarVisualizerBars: View {
  @Environment(\.theme) private var theme

  let date: Date
  let epoch: Date
  let state: SCAgentState?
  let barCount: Int
  let levels: (any SCAudioLevelProvider)?
  let minHeight: Double
  let maxHeight: Double
  let demo: Bool
  let centerAlign: Bool

  @State private var sampledBands: [Double] = []
  @State private var lastSample = Date.distantPast

  private var elapsed: TimeInterval {
    max(date.timeIntervalSince(epoch), 0)
  }

  var body: some View {
    let bands = volumeBands
    let highlighted = highlightedIndices
    GeometryReader { geometry in
      HStack(alignment: centerAlign ? .center : .bottom, spacing: 6) {
        ForEach(0..<barCount, id: \.self) { index in
          bar(
            heightPercent: heightPercent(for: index, bands: bands),
            isHighlighted: highlighted.contains(index),
            available: geometry.size.height
          )
        }
      }
      .frame(
        maxWidth: .infinity,
        maxHeight: .infinity,
        alignment: centerAlign ? .center : .bottom
      )
    }
    .animation(.easeInOut(duration: 0.15), value: bands)
    .animation(.easeInOut(duration: 0.15), value: highlighted)
    .onChange(of: date) { _, now in
      sampleProvider(at: now)
    }
  }

  private func bar(heightPercent: Double, isHighlighted: Bool, available: CGFloat) -> some View {
    let fill = isHighlighted || state == .speaking ? theme.primary : theme.border
    return Capsule(style: .continuous)
      .fill(fill)
      .frame(minWidth: 8, maxWidth: 12)
      .frame(height: available * heightPercent / 100)
      .opacity(state == .thinking && isHighlighted ? thinkingPulseOpacity : 1)
  }

  private func heightPercent(for index: Int, bands: [Double]) -> Double {
    let volume = index < bands.count ? bands[index] : 0
    return min(maxHeight, max(minHeight, volume * 100 + 5))
  }

  /// Upstream's 300 ms `animate-pulse` on the thinking highlight.
  private var thinkingPulseOpacity: Double {
    0.75 + 0.25 * cos(elapsed / 0.3 * 2 * .pi)
  }

  // MARK: Volume bands

  private var volumeBands: [Double] {
    if demo {
      return demoBands
    }
    if levels != nil {
      return sampledBands
    }
    return Array(repeating: 0, count: barCount)
  }

  /// Upstream's fake data: only speaking and listening animate; other
  /// states rest at 0.2. Values refresh every 50 ms.
  private var demoBands: [Double] {
    guard state == .speaking || state == .listening else {
      return Array(repeating: 0.2, count: barCount)
    }
    let tick = (elapsed / 0.05).rounded(.down)
    let time = tick * 0.05
    return (0..<barCount).map { index in
      let base = sin(time * 2 + Double(index) * 0.5) * 0.3 + 0.5
      let noise = hashNoise(tick * 78.233 + Double(index) * 12.9898) * 0.2
      return max(0.1, min(1, base + noise))
    }
  }

  /// Deterministic stand-in for upstream's `Math.random()` noise.
  private func hashNoise(_ seed: Double) -> Double {
    let value = sin(seed) * 43758.5453123
    return value - value.rounded(.down)
  }

  private func sampleProvider(at now: Date) {
    guard !demo, let provider = levels else { return }
    // Multiband default update interval (32 ms).
    guard now.timeIntervalSince(lastSample) >= 0.032 else { return }
    lastSample = now
    let sampled = provider.levels(bandCount: barCount).map { Double($0) }
    var padded = Array(sampled.prefix(barCount))
    if padded.count < barCount {
      padded += Array(repeating: 0, count: barCount - padded.count)
    }
    // Upstream skips state updates below a 0.01 change threshold.
    let changed =
      padded.count != sampledBands.count
      || zip(padded, sampledBands).contains { abs($0 - $1) > 0.01 }
    if changed {
      sampledBands = padded
    }
  }

  // MARK: Highlight sequencing

  /// Upstream's `useBarAnimator` sequences, derived from elapsed time:
  /// a mirrored sweep while connecting (2 s total) or initializing
  /// (1 s per step), a center blink while listening (500 ms) or
  /// thinking (150 ms), and every bar while speaking or stateless.
  private var highlightedIndices: Set<Int> {
    guard barCount > 0 else { return [] }
    switch state {
    case .connecting:
      return sweepFrame(interval: 2.0 / Double(barCount))
    case .initializing:
      return sweepFrame(interval: 1.0)
    case .listening:
      return blinkFrame(interval: 0.5)
    case .thinking:
      return blinkFrame(interval: 0.15)
    case .speaking, nil:
      return Set(0..<barCount)
    }
  }

  private func frameIndex(interval: TimeInterval, sequenceLength: Int) -> Int {
    guard interval > 0, sequenceLength > 0 else { return 0 }
    return Int(elapsed / interval) % sequenceLength
  }

  private func sweepFrame(interval: TimeInterval) -> Set<Int> {
    let step = frameIndex(interval: interval, sequenceLength: barCount)
    return [step, barCount - 1 - step]
  }

  private func blinkFrame(interval: TimeInterval) -> Set<Int> {
    let step = frameIndex(interval: interval, sequenceLength: 2)
    return step == 0 ? [barCount / 2] : []
  }
}
