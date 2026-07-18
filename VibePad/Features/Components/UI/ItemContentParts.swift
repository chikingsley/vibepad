// ============================================================
// ItemContentParts.swift — swiftcn-ui
// Supplemental source for: item
// ============================================================
import SwiftUI

// MARK: - Group and separator

public struct SCItemGroup<Content: View>: View {
  private let spacing: CGFloat
  private let content: Content

  public init(spacing: CGFloat = 0, @ViewBuilder content: () -> Content) {
    self.spacing = spacing
    self.content = content()
  }

  public var body: some View {
    VStack(spacing: spacing) { content }
      .frame(maxWidth: .infinity)
      .accessibilityElement(children: .contain)
  }
}

public struct SCItemSeparator: View {
  public init() {}

  public var body: some View {
    SCSeparator()
  }
}

// MARK: - Media

public struct SCItemMedia<Content: View>: View {
  @Environment(\.theme) private var theme

  private let variant: SCItemMediaVariant
  private let isDecorative: Bool
  private let content: Content

  public init(
    variant: SCItemMediaVariant = .default,
    isDecorative: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.variant = variant
    self.isDecorative = isDecorative
    self.content = content()
  }

  public var body: some View {
    Group {
      switch variant {
      case .default:
        content
      case .icon:
        content
          .frame(width: 32, height: 32)
          .background(theme.muted, in: mediaShape)
          .overlay { mediaShape.strokeBorder(theme.border) }
      case .image:
        content
          .frame(width: 40, height: 40)
          .clipShape(mediaShape)
      }
    }
    .accessibilityHidden(isDecorative)
    .layoutValue(key: SCItemLayoutRoleKey.self, value: .media)
  }

  private var mediaShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: max(theme.radius - 2, 2), style: .continuous)
  }
}

// MARK: - Content

public struct SCItemContent<Content: View>: View {
  @Environment(\.scItemSize) private var size
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: size == .xs ? 2 : 4) {
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .layoutValue(key: SCItemLayoutRoleKey.self, value: .content)
  }
}

public struct SCItemTitle<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: 8) { content }
      .font(.subheadline.weight(.medium))
      .lineLimit(1)
      .fixedSize(horizontal: false, vertical: true)
  }
}

extension SCItemTitle where Content == Text {
  public init(_ title: String) {
    self.init { Text(title) }
  }
}

public struct SCItemDescription<Content: View>: View {
  @Environment(\.theme) private var theme

  private let lineLimit: Int?
  private let content: Content

  public init(
    lineLimit: Int? = 2,
    @ViewBuilder content: () -> Content
  ) {
    self.lineLimit = lineLimit
    self.content = content()
  }

  public var body: some View {
    content
      .font(.subheadline)
      .foregroundStyle(theme.mutedForeground)
      .lineLimit(lineLimit)
      .fixedSize(horizontal: false, vertical: true)
  }
}

extension SCItemDescription where Content == Text {
  public init(_ description: String, lineLimit: Int? = 2) {
    self.init(lineLimit: lineLimit) { Text(description) }
  }
}

public struct SCItemActions<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: 8) { content }
      .fixedSize(horizontal: true, vertical: false)
      .layoutValue(key: SCItemLayoutRoleKey.self, value: .actions)
  }
}

// MARK: - Header and footer

nonisolated private struct SCItemEdgeLayout: Layout {
  let spacing: CGFloat
  let layoutDirection: LayoutDirection

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout Void
  ) -> CGSize {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let contentWidth =
      sizes.map(\.width).reduce(0, +)
      + spacing * CGFloat(max(sizes.count - 1, 0))
    return CGSize(
      width: proposal.width ?? contentWidth,
      height: sizes.map(\.height).max() ?? 0
    )
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout Void
  ) {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let contentWidth = sizes.map(\.width).reduce(0, +)
    let gap: CGFloat
    if sizes.count > 1 {
      gap = max(spacing, (bounds.width - contentWidth) / CGFloat(sizes.count - 1))
    } else {
      gap = 0
    }

    var x = layoutDirection == .leftToRight ? bounds.minX : bounds.maxX
    for (offset, size) in sizes.enumerated() {
      if layoutDirection == .rightToLeft { x -= size.width }
      subviews[offset].place(
        at: CGPoint(x: x, y: bounds.midY - size.height / 2),
        anchor: .topLeading,
        proposal: ProposedViewSize(size)
      )
      if layoutDirection == .leftToRight {
        x += size.width + gap
      } else {
        x -= gap
      }
    }
  }
}

public struct SCItemHeader<Content: View>: View {
  @Environment(\.layoutDirection) private var layoutDirection
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    SCItemEdgeLayout(spacing: 8, layoutDirection: layoutDirection) { content }
      .frame(maxWidth: .infinity)
      .layoutValue(key: SCItemLayoutRoleKey.self, value: .header)
  }
}

public struct SCItemFooter<Content: View>: View {
  @Environment(\.layoutDirection) private var layoutDirection
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    SCItemEdgeLayout(spacing: 8, layoutDirection: layoutDirection) { content }
      .frame(maxWidth: .infinity)
      .layoutValue(key: SCItemLayoutRoleKey.self, value: .footer)
  }
}

// MARK: - Compact convenience composition

private struct SCItemCompact<Leading: View, Title: View, Description: View, Trailing: View>: View {
  let leading: Leading
  let title: Title
  let description: Description
  let trailing: Trailing

  var body: some View {
    HStack(spacing: 12) {
      leading
      SCItemContent {
        SCItemTitle { title }
        SCItemDescription { description }
      }
      trailing
    }
  }
}

extension SCItem where Content == AnyView {
  /// A concise row initializer composed inside the same Item root.
  public init<Leading: View, Title: View, Description: View, Trailing: View>(
    variant: SCItemVariant = .default,
    size: SCItemSize = .default,
    @ViewBuilder leading: () -> Leading = { EmptyView() },
    @ViewBuilder title: () -> Title,
    @ViewBuilder description: () -> Description = { EmptyView() },
    @ViewBuilder trailing: () -> Trailing = { EmptyView() }
  ) {
    self.init(variant: variant, size: size) {
      AnyView(
        SCItemCompact(
          leading: leading(),
          title: title(),
          description: description(),
          trailing: trailing()
        )
      )
    }
  }

  public init<Leading: View, Trailing: View>(
    _ title: String,
    variant: SCItemVariant = .default,
    size: SCItemSize = .default,
    @ViewBuilder leading: () -> Leading = { EmptyView() },
    @ViewBuilder trailing: () -> Trailing = { EmptyView() }
  ) {
    self.init(
      variant: variant,
      size: size,
      leading: leading,
      title: { Text(title) },
      trailing: trailing
    )
  }

  public init<Leading: View, Trailing: View>(
    _ title: String,
    description: String,
    variant: SCItemVariant = .default,
    size: SCItemSize = .default,
    @ViewBuilder leading: () -> Leading = { EmptyView() },
    @ViewBuilder trailing: () -> Trailing = { EmptyView() }
  ) {
    self.init(
      variant: variant,
      size: size,
      leading: leading,
      title: { Text(title) },
      description: { Text(description) },
      trailing: trailing
    )
  }
}
