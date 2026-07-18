// ============================================================
// Field.swift — swiftcn-ui
// Depends on: Theme/
// ============================================================
import Accessibility
import SwiftUI

// MARK: - Environment

public struct SCFieldInvalidKey: EnvironmentKey {
  public static let defaultValue = false
}

extension EnvironmentValues {
  /// `true` inside an invalid `SCField`. Custom controls can read this to
  /// apply their own invalid treatment.
  public var scFieldInvalid: Bool {
    get { self[SCFieldInvalidKey.self] }
    set { self[SCFieldInvalidKey.self] = newValue }
  }
}

// MARK: - Field set and legend

/// A semantic container for a related set of fields.
public struct SCFieldSet<Content: View>: View {
  private let spacing: CGFloat
  private let isDisabled: Bool
  private let content: Content

  public init(
    spacing: CGFloat = 20,
    isDisabled: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.spacing = max(spacing, 0)
    self.isDisabled = isDisabled
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .disabled(isDisabled)
    .accessibilityElement(children: .contain)
  }
}

public enum SCFieldLegendVariant: Hashable, Sendable {
  case legend
  case label
}

/// An arbitrary heading for a field set.
public struct SCFieldLegend<Content: View>: View {
  @Environment(\.theme) private var theme

  private let variant: SCFieldLegendVariant
  private let content: Content

  public init(
    variant: SCFieldLegendVariant = .legend,
    @ViewBuilder content: () -> Content
  ) {
    self.variant = variant
    self.content = content()
  }

  public var body: some View {
    content
      .font(variant == .legend ? .title3.weight(.semibold) : .footnote.weight(.medium))
      .foregroundStyle(theme.foreground)
      .accessibilityAddTraits(.isHeader)
  }
}

extension SCFieldLegend where Content == Text {
  public init(
    _ title: String,
    variant: SCFieldLegendVariant = .legend
  ) {
    self.init(variant: variant) { Text(title) }
  }
}

// MARK: - Group

/// A vertical collection of fields with consistent spacing.
public struct SCFieldGroup<Content: View>: View {
  private let spacing: CGFloat
  private let content: Content

  public init(
    spacing: CGFloat = 20,
    @ViewBuilder content: () -> Content
  ) {
    self.spacing = max(spacing, 0)
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

// MARK: - Field root

public enum SCFieldOrientation: Hashable, Sendable {
  case vertical
  case horizontal
  case responsive
}

/// A caller-composed form field that propagates invalid and disabled state to
/// its controls and lays its parts out vertically, horizontally, or
/// responsively.
public struct SCField<Content: View>: View {
  private let orientation: SCFieldOrientation
  private let isInvalid: Bool
  private let isDisabled: Bool
  private let spacing: CGFloat
  private let responsiveBreakpoint: CGFloat
  private let content: Content

  public init(
    orientation: SCFieldOrientation = .vertical,
    isInvalid: Bool = false,
    isDisabled: Bool = false,
    spacing: CGFloat? = nil,
    responsiveBreakpoint: CGFloat = 448,
    @ViewBuilder content: () -> Content
  ) {
    self.orientation = orientation
    self.isInvalid = isInvalid
    self.isDisabled = isDisabled
    self.spacing = max(spacing ?? (orientation == .vertical ? 6 : 12), 0)
    self.responsiveBreakpoint = max(responsiveBreakpoint, 0)
    self.content = content()
  }

  @ViewBuilder
  public var body: some View {
    layout
      .environment(\.scFieldInvalid, isInvalid)
      .disabled(isDisabled)
      .accessibilityElement(children: .contain)
  }

  @ViewBuilder
  private var layout: some View {
    switch orientation {
    case .vertical:
      VStack(alignment: .leading, spacing: spacing) {
        content
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .horizontal:
      HStack(alignment: .center, spacing: spacing) {
        content
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .responsive:
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .center, spacing: spacing) {
          content
        }
        .frame(minWidth: responsiveBreakpoint, maxWidth: .infinity, alignment: .leading)

        VStack(alignment: .leading, spacing: spacing) {
          content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

// MARK: - Field content and labels

/// A flexible text region used beside checkboxes, radio buttons, switches, or
/// horizontally arranged controls.
public struct SCFieldContent<Content: View>: View {
  private let spacing: CGFloat
  private let content: Content

  public init(
    spacing: CGFloat = 4,
    @ViewBuilder content: () -> Content
  ) {
    self.spacing = max(spacing, 0)
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// An arbitrary field label with an optional required indicator.
public struct SCFieldLabel<Content: View>: View {
  @Environment(\.theme) private var theme

  private let isRequired: Bool
  private let content: Content

  public init(
    isRequired: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.isRequired = isRequired
    self.content = content()
  }

  public var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 2) {
      content
      if isRequired {
        Text("*")
          .foregroundStyle(theme.destructive)
          .accessibilityLabel("required")
      }
    }
    .font(.footnote.weight(.medium))
    .foregroundStyle(theme.foreground)
  }
}

extension SCFieldLabel where Content == Text {
  public init(
    _ title: String,
    isRequired: Bool = false
  ) {
    self.init(isRequired: isRequired) { Text(title) }
  }
}

/// A non-label title used inside a compound field option.
public struct SCFieldTitle<Content: View>: View {
  @Environment(\.theme) private var theme

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.footnote.weight(.medium))
      .foregroundStyle(theme.foreground)
  }
}

extension SCFieldTitle where Content == Text {
  public init(_ title: String) {
    self.init { Text(title) }
  }
}

/// Arbitrary helper content for a field.
public struct SCFieldDescription<Content: View>: View {
  @Environment(\.theme) private var theme

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.caption)
      .foregroundStyle(theme.mutedForeground)
  }
}

extension SCFieldDescription where Content == Text {
  public init(_ description: String) {
    self.init { Text(description) }
  }
}
