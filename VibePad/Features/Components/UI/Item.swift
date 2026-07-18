// ============================================================
// Item.swift — swiftcn-ui
// Depends on: Separator.swift · Theme/
// Preview dependencies: Badge.swift · Button.swift
// ============================================================
import SwiftUI

// MARK: - Variants

public enum SCItemVariant: CaseIterable, Equatable, Hashable, Sendable {
  case `default`
  case outline
  case muted
}

public enum SCItemSize: CaseIterable, Equatable, Hashable, Sendable {
  case `default`
  case sm
  case xs
}

public enum SCItemMediaVariant: CaseIterable, Equatable, Hashable, Sendable {
  case `default`
  case icon
  case image
}

// MARK: - Shared environment

struct SCItemInteractionState {
  var isInteractive = false
  var isHovered = false
  var isPressed = false
  var isFocused = false
}

private struct SCItemInteractionStateKey: EnvironmentKey {
  static let defaultValue = SCItemInteractionState()
}

private struct SCItemSizeKey: EnvironmentKey {
  static let defaultValue = SCItemSize.default
}

extension EnvironmentValues {
  var scItemInteractionState: SCItemInteractionState {
    get { self[SCItemInteractionStateKey.self] }
    set { self[SCItemInteractionStateKey.self] = newValue }
  }

  var scItemSize: SCItemSize {
    get { self[SCItemSizeKey.self] }
    set { self[SCItemSizeKey.self] = newValue }
  }
}

// MARK: - Root layout

nonisolated enum SCItemLayoutRole {
  case body
  case media
  case content
  case actions
  case header
  case footer
}

nonisolated struct SCItemLayoutRoleKey: LayoutValueKey {
  static let defaultValue = SCItemLayoutRole.body
}

nonisolated private struct SCItemMeasuredSubview {
  let index: Int
  let size: CGSize
}

nonisolated private struct SCItemMeasurement {
  let width: CGFloat
  let height: CGFloat
  let headers: [SCItemMeasuredSubview]
  let main: [SCItemMeasuredSubview]
  let footers: [SCItemMeasuredSubview]
  let mainHeight: CGFloat
}

nonisolated private struct SCItemLayout: Layout {
  let horizontalSpacing: CGFloat
  let verticalSpacing: CGFloat
  let layoutDirection: LayoutDirection

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout Void
  ) -> CGSize {
    let measurement = measure(width: proposal.width, subviews: subviews)
    return CGSize(width: measurement.width, height: measurement.height)
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout Void
  ) {
    let measurement = measure(width: bounds.width, subviews: subviews)
    var y = bounds.minY

    for header in measurement.headers {
      place(
        header,
        x: bounds.minX,
        y: y,
        subviews: subviews,
        proposedWidth: bounds.width
      )
      y += header.size.height
    }

    if !measurement.headers.isEmpty, !measurement.main.isEmpty {
      y += verticalSpacing
    }

    if !measurement.main.isEmpty {
      var x = layoutDirection == .leftToRight ? bounds.minX : bounds.maxX
      for (offset, measured) in measurement.main.enumerated() {
        if layoutDirection == .rightToLeft {
          x -= measured.size.width
        }

        let role = subviews[measured.index][SCItemLayoutRoleKey.self]
        let childY = verticalOrigin(
          for: measured,
          role: role,
          rowOrigin: y,
          rowHeight: measurement.mainHeight
        )

        place(
          measured,
          x: x,
          y: childY,
          subviews: subviews,
          proposedWidth: measured.size.width
        )

        if layoutDirection == .leftToRight {
          x += measured.size.width
          if offset < measurement.main.count - 1 { x += horizontalSpacing }
        } else if offset < measurement.main.count - 1 {
          x -= horizontalSpacing
        }
      }
      y += measurement.mainHeight
    }

    y = footerOrigin(after: y, measurement: measurement)

    for footer in measurement.footers {
      place(
        footer,
        x: bounds.minX,
        y: y,
        subviews: subviews,
        proposedWidth: bounds.width
      )
      y += footer.size.height
    }
  }

  private func footerOrigin(after origin: CGFloat, measurement: SCItemMeasurement) -> CGFloat {
    guard !measurement.footers.isEmpty else { return origin }
    let hasPrecedingRow = !measurement.main.isEmpty || !measurement.headers.isEmpty
    return hasPrecedingRow ? origin + verticalSpacing : origin
  }

  private func measure(width: CGFloat?, subviews: Subviews) -> SCItemMeasurement {
    let headerIndices = subviews.indices.filter {
      subviews[$0][SCItemLayoutRoleKey.self] == .header
    }
    let footerIndices = subviews.indices.filter {
      subviews[$0][SCItemLayoutRoleKey.self] == .footer
    }
    let mainIndices = subviews.indices.filter {
      let role = subviews[$0][SCItemLayoutRoleKey.self]
      return role != .header && role != .footer
    }

    let fullWidthProposal = ProposedViewSize(width: width, height: nil)
    let headers = headerIndices.map {
      SCItemMeasuredSubview(
        index: $0,
        size: subviews[$0].sizeThatFits(fullWidthProposal)
      )
    }
    let footers = footerIndices.map {
      SCItemMeasuredSubview(
        index: $0,
        size: subviews[$0].sizeThatFits(fullWidthProposal)
      )
    }
    let main = measureMain(indices: mainIndices, width: width, subviews: subviews)

    let headerWidth = headers.map(\.size.width).max() ?? 0
    let footerWidth = footers.map(\.size.width).max() ?? 0
    let mainWidth =
      main.map(\.size.width).reduce(0, +)
      + horizontalSpacing * CGFloat(max(main.count - 1, 0))
    let resolvedWidth = width ?? max(headerWidth, footerWidth, mainWidth)
    let mainHeight = main.map(\.size.height).max() ?? 0

    var resolvedHeight =
      headers.map(\.size.height).reduce(0, +)
      + mainHeight
      + footers.map(\.size.height).reduce(0, +)
    let populatedRegionCount = [!headers.isEmpty, !main.isEmpty, !footers.isEmpty]
      .filter { $0 }.count
    resolvedHeight += verticalSpacing * CGFloat(max(populatedRegionCount - 1, 0))

    return SCItemMeasurement(
      width: resolvedWidth,
      height: resolvedHeight,
      headers: headers,
      main: main,
      footers: footers,
      mainHeight: mainHeight
    )
  }

  private func measureMain(
    indices: [Int],
    width: CGFloat?,
    subviews: Subviews
  ) -> [SCItemMeasuredSubview] {
    guard let width else {
      return indices.map {
        SCItemMeasuredSubview(index: $0, size: subviews[$0].sizeThatFits(.unspecified))
      }
    }

    let flexibleIndex =
      indices.first {
        subviews[$0][SCItemLayoutRoleKey.self] == .content
      }
      ?? indices.first {
        subviews[$0][SCItemLayoutRoleKey.self] == .body
      }
    var measured: [Int: CGSize] = [:]

    for index in indices where index != flexibleIndex {
      measured[index] = subviews[index].sizeThatFits(.unspecified)
    }

    let fixedWidth = measured.values.map(\.width).reduce(0, +)
    let gaps = horizontalSpacing * CGFloat(max(indices.count - 1, 0))
    if let flexibleIndex {
      let remaining = max(width - fixedWidth - gaps, 0)
      measured[flexibleIndex] = subviews[flexibleIndex].sizeThatFits(
        ProposedViewSize(width: remaining, height: nil)
      )
    }

    return indices.compactMap { index in
      measured[index].map { SCItemMeasuredSubview(index: index, size: $0) }
    }
  }

  private func verticalOrigin(
    for measured: SCItemMeasuredSubview,
    role: SCItemLayoutRole,
    rowOrigin: CGFloat,
    rowHeight: CGFloat
  ) -> CGFloat {
    if role == .media, measured.size.height < rowHeight {
      return rowOrigin + min(2, rowHeight - measured.size.height)
    }
    return rowOrigin + (rowHeight - measured.size.height) / 2
  }

  private func place(
    _ measured: SCItemMeasuredSubview,
    x: CGFloat,
    y: CGFloat,
    subviews: Subviews,
    proposedWidth: CGFloat
  ) {
    subviews[measured.index].place(
      at: CGPoint(x: x, y: y),
      anchor: .topLeading,
      proposal: ProposedViewSize(width: proposedWidth, height: measured.size.height)
    )
  }
}

// MARK: - Root

/// A caller-composed item surface. Header and footer parts occupy full rows;
/// media, content, actions, and arbitrary body views share the middle row.
public struct SCItem<Content: View>: View {
  @Environment(\.theme) private var theme
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.layoutDirection) private var layoutDirection
  @Environment(\.scItemInteractionState) private var interaction

  private let variant: SCItemVariant
  private let size: SCItemSize
  private let content: Content

  public init(
    variant: SCItemVariant = .default,
    size: SCItemSize = .default,
    @ViewBuilder content: () -> Content
  ) {
    self.variant = variant
    self.size = size
    self.content = content()
  }

  public var body: some View {
    SCItemLayout(
      horizontalSpacing: horizontalSpacing,
      verticalSpacing: verticalSpacing,
      layoutDirection: layoutDirection
    ) {
      content
    }
    .environment(\.scItemSize, size)
    .padding(padding)
    .frame(maxWidth: .infinity)
    .background(background, in: shape)
    .overlay { border }
    .overlay { focusRing }
    .foregroundStyle(theme.foreground)
    .contentShape(shape)
    .opacity(isEnabled ? 1 : 0.5)
    .accessibilityElement(children: .contain)
    .animation(.easeOut(duration: 0.1), value: interaction.isHovered)
    .animation(.easeOut(duration: 0.1), value: interaction.isPressed)
  }

  private var padding: EdgeInsets {
    switch size {
    case .default:
      EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16)
    case .sm:
      EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
    case .xs:
      EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12)
    }
  }

  private var horizontalSpacing: CGFloat {
    switch size {
    case .default: 16
    case .sm: 10
    case .xs: 8
    }
  }

  private var verticalSpacing: CGFloat {
    switch size {
    case .default: 12
    case .sm: 8
    case .xs: 6
    }
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
  }

  private var background: Color {
    if interaction.isInteractive && isEnabled {
      if interaction.isPressed { return theme.accent.opacity(0.75) }
      if interaction.isHovered { return theme.accent.opacity(0.5) }
    }
    return variant == .muted ? theme.muted.opacity(0.5) : .clear
  }

  @ViewBuilder
  private var border: some View {
    if variant == .outline {
      shape.strokeBorder(theme.border)
    }
  }

  @ViewBuilder
  private var focusRing: some View {
    if interaction.isInteractive && interaction.isFocused {
      shape.strokeBorder(theme.ring.opacity(0.5), lineWidth: 3)
    }
  }
}
