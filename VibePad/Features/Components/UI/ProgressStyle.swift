import SwiftUI

/// A `ProgressViewStyle` convenience backed by the same SCProgress parts.
public struct SCProgressStyle: ProgressViewStyle {
  private let trackHeight: CGFloat

  public init(trackHeight: CGFloat = 8) {
    self.trackHeight = max(trackHeight, 1)
  }

  public func makeBody(configuration: Configuration) -> some View {
    SCProgress(
      value: configuration.fractionCompleted,
      minimumValue: 0,
      maximumValue: 1,
      accessibilityLabel: "Progress",
      trackHeight: trackHeight
    ) {
      configuration.label
    }
  }
}

extension ProgressViewStyle where Self == SCProgressStyle {
  /// `ProgressView(value: progress).progressViewStyle(.scLinear)`
  public static var scLinear: SCProgressStyle { SCProgressStyle() }
}
