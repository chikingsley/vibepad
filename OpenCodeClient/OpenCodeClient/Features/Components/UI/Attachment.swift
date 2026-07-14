// ============================================================
// Attachment.swift — swiftcn-ui
// Depends on: Theme/, Button.swift, Shimmer.swift
// ============================================================
import SwiftUI

// MARK: - Configuration

public nonisolated enum SCAttachmentState: CaseIterable, Equatable, Sendable {
  case idle, uploading, processing, error, done
}

public nonisolated enum SCAttachmentSize: CaseIterable, Equatable, Sendable {
  case `default`, small, extraSmall
}

public nonisolated enum SCAttachmentOrientation: CaseIterable, Equatable, Sendable {
  case horizontal, vertical
}

public nonisolated enum SCAttachmentMediaVariant: CaseIterable, Equatable, Sendable {
  case icon, image
}

struct SCAttachmentConfiguration {
  var state: SCAttachmentState = .done
  var size: SCAttachmentSize = .default
  var orientation: SCAttachmentOrientation = .horizontal
}

private struct SCAttachmentConfigurationKey: EnvironmentKey {
  static let defaultValue = SCAttachmentConfiguration()
}

extension EnvironmentValues {
  var scAttachmentConfiguration: SCAttachmentConfiguration {
    get { self[SCAttachmentConfigurationKey.self] }
    set { self[SCAttachmentConfigurationKey.self] = newValue }
  }
}

// MARK: - Root

/// A composable file or media attachment.
public struct SCAttachment<Content: View>: View {
  @Environment(\.theme) private var theme
  @Environment(\.isEnabled) private var isEnabled

  @State private var isHovered = false

  private let state: SCAttachmentState
  private let size: SCAttachmentSize
  private let orientation: SCAttachmentOrientation
  private let content: Content

  public init(
    state: SCAttachmentState = .done,
    size: SCAttachmentSize = .default,
    orientation: SCAttachmentOrientation = .horizontal,
    @ViewBuilder content: () -> Content
  ) {
    self.state = state
    self.size = size
    self.orientation = orientation
    self.content = content()
  }

  public var body: some View {
    Group {
      switch orientation {
      case .horizontal:
        HStack(spacing: spacing) { content }
      case .vertical:
        VStack(alignment: .leading, spacing: spacing) { content }
      }
    }
    .padding(padding)
    .background(background, in: shape)
    .overlay {
      shape.strokeBorder(strokeColor, style: strokeStyle)
    }
    .contentShape(shape)
    .opacity(isEnabled ? 1 : 0.5)
    .environment(
      \.scAttachmentConfiguration,
      SCAttachmentConfiguration(state: state, size: size, orientation: orientation)
    )
    .onHover { isHovered = $0 }
  }

  private var spacing: CGFloat {
    switch size {
    case .default: 12
    case .small: 8
    case .extraSmall: 6
    }
  }

  private var padding: EdgeInsets {
    switch size {
    case .default: EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)
    case .small: EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
    case .extraSmall: EdgeInsets(top: 6, leading: 6, bottom: 6, trailing: 6)
    }
  }

  private var background: Color {
    if state == .error { return theme.destructive.opacity(0.08) }
    return isHovered ? theme.muted.opacity(0.5) : theme.card
  }

  private var strokeColor: Color {
    state == .error ? theme.destructive.opacity(0.4) : theme.border
  }

  private var strokeStyle: StrokeStyle {
    StrokeStyle(lineWidth: 1, dash: state == .idle ? [5, 4] : [])
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
  }
}

// MARK: - Media

public struct SCAttachmentMedia<Content: View>: View {
  @Environment(\.theme) private var theme
  @Environment(\.scAttachmentConfiguration) private var attachment

  private let variant: SCAttachmentMediaVariant
  private let content: Content

  public init(
    variant: SCAttachmentMediaVariant = .icon,
    @ViewBuilder content: () -> Content
  ) {
    self.variant = variant
    self.content = content()
  }

  public var body: some View {
    content
      .frame(width: length, height: length)
      .background(background)
      .foregroundStyle(foreground)
      .clipShape(shape)
      .contentShape(shape)
  }

  private var length: CGFloat {
    switch attachment.size {
    case .default: 44
    case .small: 36
    case .extraSmall: 28
    }
  }

  @ViewBuilder private var background: some View {
    if variant == .icon {
      (attachment.state == .error ? theme.destructive.opacity(0.1) : theme.secondary)
    }
  }

  private var foreground: Color {
    attachment.state == .error ? theme.destructive : theme.secondaryForeground
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: max(theme.radius - 2, 4), style: .continuous)
  }
}

// MARK: - Text content

public struct SCAttachmentContent<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

public struct SCAttachmentTitle<Content: View>: View {
  @Environment(\.theme) private var theme
  @Environment(\.scAttachmentConfiguration) private var attachment

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(titleFont)
      .foregroundStyle(theme.cardForeground)
      .lineLimit(1)
      .truncationMode(.middle)
      .scShimmer(active: attachment.state == .uploading || attachment.state == .processing)
  }

  private var titleFont: Font {
    attachment.size == .extraSmall ? .caption.weight(.medium) : .footnote.weight(.medium)
  }
}

extension SCAttachmentTitle where Content == Text {
  public init(_ title: String) {
    self.init { Text(title) }
  }
}

public struct SCAttachmentDescription<Content: View>: View {
  @Environment(\.theme) private var theme
  @Environment(\.scAttachmentConfiguration) private var attachment

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.caption2)
      .foregroundStyle(
        attachment.state == .error
          ? theme.destructive.opacity(0.8)
          : theme.mutedForeground
      )
      .lineLimit(1)
      .truncationMode(.middle)
  }
}

extension SCAttachmentDescription where Content == Text {
  public init(_ description: String) {
    self.init { Text(description) }
  }
}

// MARK: - Actions

public struct SCAttachmentActions<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: 4) {
      content
    }
    .fixedSize()
  }
}

public struct SCAttachmentAction<Label: View>: View {
  private let variant: SCButtonVariant
  private let size: SCButtonSize
  private let isDisabled: Bool
  private let action: () -> Void
  private let label: Label

  public init(
    variant: SCButtonVariant = .ghost,
    size: SCButtonSize = .iconXS,
    isDisabled: Bool = false,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) {
    self.variant = variant
    self.size = size
    self.isDisabled = isDisabled
    self.action = action
    self.label = label()
  }

  public var body: some View {
    Button(action: action) { label }
      .buttonStyle(.sc(variant, size: size))
      .disabled(isDisabled)
  }
}

// MARK: - Full-card trigger

/// Gives a complete attachment native button semantics.
///
/// Wrap an attachment in this trigger when the whole card is interactive. Do
/// not nest `SCAttachmentAction` buttons inside a full-card trigger.
public struct SCAttachmentTrigger<Content: View>: View {
  private let isDisabled: Bool
  private let action: () -> Void
  private let content: Content

  public init(
    isDisabled: Bool = false,
    action: @escaping () -> Void,
    @ViewBuilder content: () -> Content
  ) {
    self.isDisabled = isDisabled
    self.action = action
    self.content = content()
  }

  public var body: some View {
    Button(action: action) { content }
      .buttonStyle(.plain)
      .disabled(isDisabled)
  }
}

// MARK: - Group

public struct SCAttachmentGroup<Content: View>: View {
  private let spacing: CGFloat
  private let content: Content

  public init(
    spacing: CGFloat = 8,
    @ViewBuilder content: () -> Content
  ) {
    self.spacing = spacing
    self.content = content()
  }

  public var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: spacing) {
        content
      }
      .scrollTargetLayout()
    }
    .scrollIndicators(.hidden)
    .scrollTargetBehavior(.viewAligned)
    // Upstream's AttachmentGroup applies the scroll-fade-x utility.
    .scScrollFade(.horizontal)
  }
}
