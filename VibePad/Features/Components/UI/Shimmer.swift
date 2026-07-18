// ============================================================
// Shimmer.swift — swiftcn-ui (Effects)
// Depends on: Theme/, Components/Button.swift (SCShimmerButton only)
//
// `scShimmer` is the port of shadcn/ui's `shimmer` utility (June
// 2026 chat release) — a text shimmer for live status, also used
// by Attachment while uploading/processing. `SCShimmerButton` is
// a swiftcn-native effect, not an upstream component.
// ============================================================
import SwiftUI

// MARK: - Modifier

extension View {
  /// Sweeps a highlight across this view, masked to its shape — the
  /// swiftcn port of shadcn/ui's `shimmer` utility (June 2026 chat
  /// release), used upstream as a text shimmer for live status. The
  /// highlight derives from the theme — fading toward the background in
  /// light appearance and brightening in dark, like upstream's
  /// `currentColor`-derived band. The sweep follows the layout
  /// direction, and it disables itself under Reduce Motion.
  ///
  ///     SCMarkerContent("Thinking…").scShimmer()
  ///
  ///     Text("Introducing swiftcn 2.0")
  ///         .font(.title2.weight(.semibold))
  ///         .scShimmer(duration: 3)
  ///
  /// - Parameters:
  ///   - active: Whether the sweep is running; `false` renders the view
  ///     untouched (upstream's `shimmer-none`).
  ///   - duration: Seconds per sweep (upstream's `shimmer-duration`).
  ///   - spread: Width of the highlight band in points (upstream's
  ///     `shimmer-spread`).
  ///   - angle: Tilt of the band (upstream's `shimmer-angle`).
  ///   - color: Overrides the derived highlight (upstream's
  ///     `shimmer-color`).
  ///   - repeats: `false` runs a single sweep (upstream's
  ///     `shimmer-once`).
  ///   - reverse: Sweeps against the reading direction (upstream's
  ///     `shimmer-reverse`).
  public func scShimmer(
    active: Bool = true,
    duration: Double = 2,
    spread: CGFloat = 72,
    angle: Angle = .degrees(20),
    color: Color? = nil,
    repeats: Bool = true,
    reverse: Bool = false
  ) -> some View {
    modifier(
      SCShimmerModifier(
        active: active,
        duration: duration,
        spread: spread,
        angle: angle,
        color: color,
        repeats: repeats,
        reverse: reverse
      )
    )
  }
}

private struct SCShimmerModifier: ViewModifier {
  @Environment(\.theme) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.layoutDirection) private var layoutDirection
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var active: Bool
  var duration: Double
  var spread: CGFloat
  var angle: Angle
  var color: Color?
  var repeats: Bool
  var reverse: Bool

  func body(content: Content) -> some View {
    content.overlay {
      // Reduce Motion renders the view untouched, exactly like
      // upstream's prefers-reduced-motion fallback.
      if active && !reduceMotion {
        GeometryReader { geometry in
          LinearGradient(
            colors: [
              highlight.opacity(0),
              highlight,
              highlight.opacity(0),
            ],
            startPoint: .leading,
            endPoint: .trailing
          )
          .frame(width: spread, height: geometry.size.height * 3)
          .rotationEffect(angle, anchor: .center)
          .offset(y: -geometry.size.height)
          // Phase -1 parks the band fully off the starting edge; 2
          // is fully past the far edge, so the repeat loops
          // seamlessly. The sweep follows the reading direction.
          .keyframeAnimator(initialValue: startPhase, repeating: repeats) { band, phase in
            band.offset(x: phase * geometry.size.width)
          } keyframes: { _ in
            LinearKeyframe(endPhase, duration: duration)
          }
        }
        .mask(content)
        .allowsHitTesting(false)
      }
    }
  }

  /// Upstream derives the band from `currentColor`: a faded highlight in
  /// light appearance, a brightened one in dark.
  private var highlight: Color {
    if let color { return color }
    return colorScheme == .dark ? theme.foreground.opacity(0.9) : theme.background.opacity(0.85)
  }

  private var sweepsBackward: Bool {
    // XOR: an explicit reverse flips whatever the reading direction is.
    (layoutDirection == .rightToLeft) != reverse
  }

  private var startPhase: CGFloat { sweepsBackward ? 2 : -1 }

  private var endPhase: CGFloat { sweepsBackward ? -1 : 2 }
}

// MARK: - Component

/// A call-to-action button with a highlight that endlessly travels its
/// border — the v1 `ShimmerButton`, rebuilt on `SCButtonStyle` and theme
/// tokens.
///
///     SCShimmerButton(text: "Get Started") { start() }
public struct SCShimmerButton: View {
  @Environment(\.theme) private var theme

  var text: String
  var duration: Double
  var action: () -> Void

  /// - Parameters:
  ///   - text: The button label.
  ///   - duration: Seconds for one full lap of the border highlight.
  ///   - action: Performed on tap.
  public init(text: String, duration: Double = 3, action: @escaping () -> Void) {
    self.text = text
    self.duration = duration
    self.action = action
  }

  public var body: some View {
    // Resolved outside the animator closure, which is nonisolated.
    let beamColor = theme.primaryForeground.opacity(0.9)
    let cornerRadius = theme.radius
    Button(text, action: action)
      .buttonStyle(.sc())
      .keyframeAnimator(initialValue: CGFloat(0), repeating: true) { content, progress in
        content.overlay {
          SCBorderBeam(progress: progress, cornerRadius: cornerRadius)
            .stroke(
              beamColor,
              style: StrokeStyle(lineWidth: 2, lineCap: .round)
            )
            .allowsHitTesting(false)
        }
      } keyframes: { _ in
        LinearKeyframe(CGFloat(1), duration: duration)
      }
  }
}

// MARK: - Border beam shape

/// A short segment of a rounded rectangle's outline, positioned by
/// `progress` (0…1 around the perimeter). Animating `progress` moves the
/// segment along the border, wrapping seamlessly at the start point.
private struct SCBorderBeam: Shape {
  var progress: CGFloat
  var length: CGFloat = 0.15
  var cornerRadius: CGFloat

  var animatableData: CGFloat {
    get { progress }
    set { progress = newValue }
  }

  func path(in rect: CGRect) -> Path {
    let base = Path(
      roundedRect: rect.insetBy(dx: 1, dy: 1),
      cornerRadius: cornerRadius,
      style: .continuous
    )
    let start = progress.truncatingRemainder(dividingBy: 1)
    let end = start + length
    if end <= 1 {
      return base.trimmedPath(from: start, to: end)
    }
    var beam = base.trimmedPath(from: start, to: 1)
    beam.addPath(base.trimmedPath(from: 0, to: end - 1))
    return beam
  }
}
