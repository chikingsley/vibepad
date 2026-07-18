// ============================================================
// Progress.swift — swiftcn-ui
// Depends on: Theme/
// ============================================================
import Foundation
import SwiftUI

// MARK: - State

/// The current semantic state of an `SCProgress` hierarchy.
public enum SCProgressStatus: Hashable, Sendable {
  case indeterminate
  case progressing
  case complete
}

/// The built-in formatting used by `SCProgressValue`.
public enum SCProgressValueFormat: Hashable, Sendable {
  /// Formats the normalized completion fraction as a localized percentage.
  case percentage
  /// Formats the clamped raw value as a localized number.
  case number
}

/// Read-only state available to custom Progress parts.
public struct SCProgressSnapshot: Hashable, Sendable {
  public let value: Double?
  public let minimumValue: Double
  public let maximumValue: Double
  public let fractionCompleted: Double?
  public let formattedValue: String?
  public let status: SCProgressStatus
}

private struct SCProgressContext: Sendable {
  var snapshot = SCProgressSnapshot(
    value: nil,
    minimumValue: 0,
    maximumValue: 100,
    fractionCompleted: nil,
    formattedValue: nil,
    status: .indeterminate
  )
}

private struct SCProgressContextKey: EnvironmentKey {
  static let defaultValue = SCProgressContext()
}

extension EnvironmentValues {
  fileprivate var scProgressContext: SCProgressContext {
    get { self[SCProgressContextKey.self] }
    set { self[SCProgressContextKey.self] = newValue }
  }
}

// MARK: - Root

/// Groups composable progress parts and supplies native progress accessibility.
///
/// The default shadcn composition appends a Track and Indicator after optional
/// Label and Value content. Set `showsDefaultTrack` to `false` when the content
/// builder supplies its own Track and Indicator arrangement.
public struct SCProgress<Content: View>: View {
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.locale) private var locale

  private let value: Double?
  private let minimumValue: Double
  private let maximumValue: Double
  private let valueFormat: SCProgressValueFormat
  private let accessibilityLabel: String
  private let accessibilityValue: String?
  private let showsDefaultTrack: Bool
  private let trackHeight: CGFloat
  private let hasHeaderContent: Bool
  private let content: Content

  public init(
    value: Double?,
    minimumValue: Double = 0,
    maximumValue: Double = 100,
    valueFormat: SCProgressValueFormat = .percentage,
    accessibilityLabel: String = "Progress",
    accessibilityValue: String? = nil,
    showsDefaultTrack: Bool = true,
    trackHeight: CGFloat = 4,
    @ViewBuilder content: () -> Content
  ) {
    self.value = value
    self.minimumValue = minimumValue
    self.maximumValue = maximumValue
    self.valueFormat = valueFormat
    self.accessibilityLabel = accessibilityLabel
    self.accessibilityValue = accessibilityValue
    self.showsDefaultTrack = showsDefaultTrack
    self.trackHeight = max(trackHeight, 1)
    self.hasHeaderContent = true
    self.content = content()
  }

  public var body: some View {
    visualBody
      .environment(\.scProgressContext, SCProgressContext(snapshot: snapshot))
      .opacity(isEnabled ? 1 : 0.5)
      .accessibilityRepresentation {
        nativeAccessibilityRepresentation
      }
  }

  @ViewBuilder
  private var visualBody: some View {
    if hasHeaderContent {
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
          content
        }
        if showsDefaultTrack {
          SCProgressTrack(height: trackHeight)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else if showsDefaultTrack {
      SCProgressTrack(height: trackHeight)
    }
  }

  @ViewBuilder
  private var nativeAccessibilityRepresentation: some View {
    if let value = snapshot.value {
      ProgressView(
        value: value - snapshot.minimumValue,
        total: max(snapshot.maximumValue - snapshot.minimumValue, 1)
      ) {
        Text(accessibilityLabel)
      }
      .accessibilityValue(Text(accessibilityValue ?? snapshot.formattedValue ?? ""))
    } else {
      ProgressView {
        Text(accessibilityLabel)
      }
      .accessibilityValue(Text(accessibilityValue ?? "In progress"))
    }
  }

  private var snapshot: SCProgressSnapshot {
    let lowerBound = min(minimumValue, maximumValue)
    let upperBound = max(minimumValue, maximumValue)
    let clampedValue = value.map { min(max($0, lowerBound), upperBound) }
    let fraction = clampedValue.map { currentValue in
      let range = upperBound - lowerBound
      guard range > 0 else { return currentValue >= upperBound ? 1.0 : 0.0 }
      return min(max((currentValue - lowerBound) / range, 0), 1)
    }
    let status: SCProgressStatus
    if fraction == nil {
      status = .indeterminate
    } else if fraction == 1 {
      status = .complete
    } else {
      status = .progressing
    }
    return SCProgressSnapshot(
      value: clampedValue,
      minimumValue: lowerBound,
      maximumValue: upperBound,
      fractionCompleted: fraction,
      formattedValue: formattedValue(value: clampedValue, fraction: fraction),
      status: status
    )
  }

  private func formattedValue(value: Double?, fraction: Double?) -> String? {
    guard let value else { return nil }
    switch valueFormat {
    case .percentage:
      return (fraction ?? 0).formatted(
        .percent.precision(.fractionLength(0)).locale(locale)
      )
    case .number:
      return value.formatted(.number.locale(locale))
    }
  }
}

extension SCProgress where Content == EmptyView {
  /// Creates the official no-label progress bar composition.
  public init(
    value: Double?,
    minimumValue: Double = 0,
    maximumValue: Double = 100,
    valueFormat: SCProgressValueFormat = .percentage,
    accessibilityLabel: String = "Progress",
    accessibilityValue: String? = nil,
    trackHeight: CGFloat = 4
  ) {
    self.value = value
    self.minimumValue = minimumValue
    self.maximumValue = maximumValue
    self.valueFormat = valueFormat
    self.accessibilityLabel = accessibilityLabel
    self.accessibilityValue = accessibilityValue
    self.showsDefaultTrack = true
    self.trackHeight = max(trackHeight, 1)
    self.hasHeaderContent = false
    self.content = EmptyView()
  }
}

// MARK: - Track

/// The themed track containing an Indicator or arbitrary replacement content.
public struct SCProgressTrack<Content: View>: View {
  @Environment(\.theme) private var theme

  private let height: CGFloat
  private let cornerRadius: CGFloat?
  private let tint: Color?
  private let content: Content

  public init(
    height: CGFloat = 4,
    cornerRadius: CGFloat? = nil,
    tint: Color? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.height = max(height, 1)
    self.cornerRadius = cornerRadius.map { max($0, 0) }
    self.tint = tint
    self.content = content()
  }

  public var body: some View {
    ZStack(alignment: .leading) {
      RoundedRectangle(cornerRadius: resolvedCornerRadius, style: .continuous)
        .fill(tint ?? theme.muted)
      content
    }
    .frame(maxWidth: .infinity)
    .frame(height: height)
    .clipShape(
      RoundedRectangle(cornerRadius: resolvedCornerRadius, style: .continuous)
    )
    .accessibilityHidden(true)
  }

  private var resolvedCornerRadius: CGFloat {
    min(cornerRadius ?? height / 2, height / 2)
  }
}

extension SCProgressTrack where Content == SCProgressIndicator {
  public init(height: CGFloat = 4, cornerRadius: CGFloat? = nil, tint: Color? = nil) {
    self.init(height: height, cornerRadius: cornerRadius, tint: tint) {
      SCProgressIndicator()
    }
  }
}

// MARK: - Indicator

/// Visualizes determinate completion or a reduced-motion-aware indeterminate state.
public struct SCProgressIndicator: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scProgressContext) private var context
  @Environment(\.theme) private var theme

  private let animationDuration: TimeInterval
  private let sweepFraction: CGFloat
  private let sweepDuration: TimeInterval
  private let customContent: ((SCProgressSnapshot) -> AnyView)?

  public init(
    animationDuration: TimeInterval = 0.35,
    sweepFraction: CGFloat = 0.3,
    sweepDuration: TimeInterval = 1.4
  ) {
    self.animationDuration = max(animationDuration, 0)
    self.sweepFraction = min(max(sweepFraction, 0.05), 1)
    self.sweepDuration = max(sweepDuration, 0.1)
    self.customContent = nil
  }

  public init<Content: View>(
    animationDuration: TimeInterval = 0.35,
    sweepFraction: CGFloat = 0.3,
    sweepDuration: TimeInterval = 1.4,
    @ViewBuilder content: @escaping (SCProgressSnapshot) -> Content
  ) {
    self.animationDuration = max(animationDuration, 0)
    self.sweepFraction = min(max(sweepFraction, 0.05), 1)
    self.sweepDuration = max(sweepDuration, 0.1)
    self.customContent = { snapshot in AnyView(content(snapshot)) }
  }

  public var body: some View {
    GeometryReader { geometry in
      if let fraction = context.snapshot.fractionCompleted {
        fill
          .frame(width: geometry.size.width * fraction)
          .animation(
            reduceMotion ? nil : .easeInOut(duration: animationDuration),
            value: fraction
          )
      } else if reduceMotion {
        fill.frame(width: geometry.size.width * sweepFraction)
      } else {
        animatedSweep(width: geometry.size.width)
      }
    }
  }

  private var fill: some View {
    Group {
      if let customContent {
        customContent(context.snapshot)
      } else {
        Rectangle().fill(theme.primary)
      }
    }
  }

  private func animatedSweep(width: CGFloat) -> some View {
    TimelineView(.animation) { timeline in
      let phase =
        timeline.date.timeIntervalSinceReferenceDate
        .truncatingRemainder(dividingBy: sweepDuration) / sweepDuration
      let indicatorWidth = width * sweepFraction
      fill
        .frame(width: indicatorWidth)
        .offset(x: (width + indicatorWidth) * phase - indicatorWidth)
    }
  }
}

// MARK: - Label and value

/// An arbitrary visible label for a progress hierarchy.
public struct SCProgressLabel<Content: View>: View {
  @Environment(\.theme) private var theme

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.subheadline.weight(.medium))
      .foregroundStyle(theme.foreground)
  }
}

extension SCProgressLabel where Content == Text {
  public init(_ label: String) {
    self.init { Text(label) }
  }
}

/// Displays the formatted value or caller-defined content for the current state.
public struct SCProgressValue<Content: View>: View {
  @Environment(\.scProgressContext) private var context
  @Environment(\.theme) private var theme

  private let content: (SCProgressSnapshot) -> Content

  public init(
    @ViewBuilder content: @escaping (SCProgressSnapshot) -> Content
  ) {
    self.content = content
  }

  public var body: some View {
    content(context.snapshot)
      .font(.subheadline)
      .foregroundStyle(theme.mutedForeground)
      .monospacedDigit()
      .frame(maxWidth: .infinity, alignment: .trailing)
  }
}

extension SCProgressValue where Content == Text {
  /// Displays the localized percentage or number supplied by the root.
  public init() {
    self.init { snapshot in
      Text(snapshot.formattedValue ?? "")
    }
  }
}
