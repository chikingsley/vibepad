// ============================================================
// Spinner.swift — swiftcn-ui
// Depends on: SwiftUI
// ============================================================
import SwiftUI

// MARK: - Component

/// A compact indeterminate loading indicator that inherits the caller's
/// foreground style.
///
///     SCSpinner()
///     SCSpinner(size: 32, lineWidth: 3)
///     Button { … } label: { HStack { SCSpinner(size: 14); Text("Saving…") } }
public struct SCSpinner: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.isEnabled) private var isEnabled

  private let size: CGFloat
  private let lineWidth: CGFloat
  private let accessibilityLabel: Text

  /// - Parameters:
  ///   - size: Diameter of the spinner in points. Defaults to shadcn's
  ///     16-point icon size.
  ///   - lineWidth: Stroke width of the arc. Defaults to 1.5 points.
  ///   - accessibilityLabel: Status announced by assistive technologies.
  public init(
    size: CGFloat = 16,
    lineWidth: CGFloat = 1.5,
    accessibilityLabel: Text = Text("Loading")
  ) {
    self.size = size
    self.lineWidth = lineWidth
    self.accessibilityLabel = accessibilityLabel
  }

  public var body: some View {
    animatedIndicator
      .opacity(isEnabled ? 1 : 0.5)
      .accessibilityRepresentation {
        ProgressView()
          .accessibilityLabel(accessibilityLabel)
      }
  }

  @ViewBuilder
  private var animatedIndicator: some View {
    if reduceMotion {
      indicator
    } else {
      indicator
        .keyframeAnimator(initialValue: 0.0, repeating: true) { content, angle in
          content.rotationEffect(.degrees(angle))
        } keyframes: { _ in
          LinearKeyframe(360.0, duration: 0.8)
        }
    }
  }

  private var indicator: some View {
    Circle()
      .trim(from: 0, to: 0.72)
      .stroke(style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
      .frame(width: size, height: size)
  }
}
