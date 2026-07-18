// ============================================================
// Bubble.swift — swiftcn-ui
// Depends on: Theme/
//
// SwiftUI port of shadcn/ui's Bubble (June 2026 chat release):
// the message surface with seven variants, start/end alignment,
// grouped consecutive bubbles, and overlapped reactions.
// Upstream parts: BubbleGroup · Bubble · BubbleContent ·
// BubbleReactions.
//
//     SCBubble(variant: .muted) {
//         SCBubbleContent("Alright, let me take a look.")
//     }
//     .scBubbleReactions { Text("👍") }
// ============================================================
import SwiftUI

// MARK: - Variants

/// The visual treatment of a bubble surface — shadcn's `variant` prop.
nonisolated public enum SCBubbleVariant: Hashable, Sendable {
  /// Primary surface with primary-foreground text — the sender default.
  case `default`
  /// Secondary surface.
  case secondary
  /// Muted surface — the usual "received" treatment.
  case muted
  /// A soft tint derived from the primary color.
  case tinted
  /// Background surface with a border.
  case outline
  /// No surface at all; content renders full-width without padding.
  case ghost
  /// Destructive tint with destructive text.
  case destructive
}

/// Which side of the container a bubble (or its reactions) aligns to —
/// shadcn's `align` prop.
nonisolated public enum SCBubbleAlignment: Hashable, Sendable {
  case start
  case end
}

/// Which edge reactions overlap — shadcn's `side` prop on `BubbleReactions`.
nonisolated public enum SCBubbleReactionsSide: Hashable, Sendable {
  case top
  case bottom
}

// MARK: - Environment

private struct SCBubbleVariantKey: EnvironmentKey {
  static let defaultValue = SCBubbleVariant.default
}

extension EnvironmentValues {
  fileprivate var scBubbleVariant: SCBubbleVariant {
    get { self[SCBubbleVariantKey.self] }
    set { self[SCBubbleVariantKey.self] = newValue }
  }
}

// MARK: - Group

/// Stacks consecutive bubbles from the same sender — shadcn's `BubbleGroup`.
///
/// Upstream infers child alignment from the enclosing message's CSS group;
/// the Swift port takes `align` explicitly so the group stays independent
/// of `SCMessage`.
///
///     SCBubbleGroup {
///         SCBubble(variant: .muted) { SCBubbleContent("It's always a one-line change 😭.") }
///         SCBubble(variant: .muted) { SCBubbleContent("Alright, let me take a look.") }
///     }
public struct SCBubbleGroup<Content: View>: View {
  var align: SCBubbleAlignment
  @ViewBuilder var content: Content

  /// Creates a bubble group.
  /// - Parameters:
  ///   - align: The side its bubbles line up on.
  ///   - content: Two or more `SCBubble`s.
  public init(align: SCBubbleAlignment = .start, @ViewBuilder content: () -> Content) {
    self.align = align
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: align == .end ? .trailing : .leading, spacing: 8) {
      content
    }
  }
}

// MARK: - Bubble

/// The message surface of the chat suite — shadcn's `Bubble`. Wraps one or
/// more `SCBubbleContent`s, sizes to its content up to 80% of the container
/// (full width for `.ghost`), and provides the variant to its contents.
///
/// Avatars, timestamps, and message-level actions belong in the companion
/// `SCMessage` family, exactly as upstream scopes them.
///
///     SCBubble { SCBubbleContent("Deploying to prod real quick.") }
///     SCBubble(variant: .muted, align: .end) {
///         SCBubbleContent("It's 4:55 PM. On a Friday.")
///     }
public struct SCBubble<Content: View>: View {
  var variant: SCBubbleVariant
  var align: SCBubbleAlignment
  @ViewBuilder var content: Content

  /// Creates a bubble.
  /// - Parameters:
  ///   - variant: The surface treatment. Defaults to `.default` (primary).
  ///   - align: `.end` pins the bubble to the trailing edge of its
  ///     container. `.start` leaves placement to the parent.
  ///   - content: Usually one `SCBubbleContent`.
  public init(
    variant: SCBubbleVariant = .default,
    align: SCBubbleAlignment = .start,
    @ViewBuilder content: () -> Content
  ) {
    self.variant = variant
    self.align = align
    self.content = content()
  }

  public var body: some View {
    let column = SCBubbleWidthCap(fraction: variant == .ghost ? 1 : 0.8) {
      VStack(alignment: align == .end ? .trailing : .leading, spacing: 4) {
        content
      }
    }
    .environment(\.scBubbleVariant, variant)

    if align == .end {
      column.frame(maxWidth: .infinity, alignment: .trailing)
    } else {
      column
    }
  }
}

// MARK: - Content

/// The padded, rounded surface inside a bubble — shadcn's `BubbleContent`.
/// Colors come from the enclosing `SCBubble`'s variant. Use the matching
/// `scBubbleContent` button style when a native Button or Link owns activation.
///
///     SCBubbleContent("What seems to be the problem?")
///     SCBubbleContent { Label("Payment received", systemImage: "checkmark.circle") }
public struct SCBubbleContent<Content: View>: View {
  private let backgroundColor: Color?
  private let foregroundColor: Color?
  private let borderColor: Color?
  private let content: Content

  /// Creates bubble content with arbitrary views.
  public init(
    backgroundColor: Color? = nil,
    foregroundColor: Color? = nil,
    borderColor: Color? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.backgroundColor = backgroundColor
    self.foregroundColor = foregroundColor
    self.borderColor = borderColor
    self.content = content()
  }

  public var body: some View {
    content.scBubbleContent(
      backgroundColor: backgroundColor,
      foregroundColor: foregroundColor,
      borderColor: borderColor
    )
  }
}

extension SCBubbleContent where Content == Text {
  /// Creates text content — the primary form.
  public init(_ text: String) {
    self.init { Text(text) }
  }
}

/// Reusable BubbleContent chrome that preserves the receiver's semantics.
public struct SCBubbleContentModifier: ViewModifier {
  @Environment(\.theme) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.scBubbleVariant) private var variant

  @State private var isHovered = false

  private let backgroundColor: Color?
  private let foregroundColor: Color?
  private let borderColor: Color?

  public init(
    backgroundColor: Color? = nil,
    foregroundColor: Color? = nil,
    borderColor: Color? = nil
  ) {
    self.backgroundColor = backgroundColor
    self.foregroundColor = foregroundColor
    self.borderColor = borderColor
  }

  public func body(content: Content) -> some View {
    Group {
      if variant == .ghost {
        stack(content)
          .foregroundStyle(foregroundColor ?? theme.foreground)
      } else {
        stack(content)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(resolvedBackground, in: shape)
          .overlay {
            if variant == .outline || borderColor != nil {
              shape.strokeBorder(borderColor ?? theme.border)
            }
          }
          .foregroundStyle(resolvedForeground)
          .clipShape(shape)
      }
    }
    .contentShape(shape)
    .opacity(isEnabled ? 1 : 0.5)
    .onHover { isHovered = $0 }
  }

  private func stack(_ content: Content) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      content
    }
    .font(.subheadline)
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius + 4, style: .continuous)
  }

  private var resolvedBackground: Color {
    if let backgroundColor { return backgroundColor }
    switch variant {
    case .default: return theme.primary.opacity(isHovered ? 0.92 : 1)
    case .secondary: return theme.secondary.opacity(isHovered ? 0.86 : 1)
    case .muted: return theme.muted.opacity(isHovered ? 0.82 : 1)
    case .tinted:
      return theme.primary.opacity(colorScheme == .dark ? 0.25 : 0.12)
    case .outline: return isHovered ? theme.accent : theme.background
    case .ghost: return .clear
    case .destructive:
      return theme.destructive.opacity(colorScheme == .dark ? 0.2 : 0.1)
    }
  }

  private var resolvedForeground: Color {
    if let foregroundColor { return foregroundColor }
    switch variant {
    case .default: return theme.primaryForeground
    case .secondary: return theme.secondaryForeground
    case .muted, .tinted, .outline, .ghost: return theme.foreground
    case .destructive: return theme.destructive
    }
  }
}

extension View {
  /// Styles this view as BubbleContent without changing its native semantics.
  public func scBubbleContent(
    backgroundColor: Color? = nil,
    foregroundColor: Color? = nil,
    borderColor: Color? = nil
  ) -> some View {
    modifier(
      SCBubbleContentModifier(
        backgroundColor: backgroundColor,
        foregroundColor: foregroundColor,
        borderColor: borderColor
      )
    )
  }
}

/// BubbleContent chrome for native Buttons and Links with real activation.
public struct SCBubbleContentButtonStyle: ButtonStyle {
  private let backgroundColor: Color?
  private let foregroundColor: Color?
  private let borderColor: Color?

  public init(
    backgroundColor: Color? = nil,
    foregroundColor: Color? = nil,
    borderColor: Color? = nil
  ) {
    self.backgroundColor = backgroundColor
    self.foregroundColor = foregroundColor
    self.borderColor = borderColor
  }

  public func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scBubbleContent(
        backgroundColor: backgroundColor,
        foregroundColor: foregroundColor,
        borderColor: borderColor
      )
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .opacity(configuration.isPressed ? 0.78 : 1)
  }
}

extension ButtonStyle where Self == SCBubbleContentButtonStyle {
  public static func scBubbleContent(
    backgroundColor: Color? = nil,
    foregroundColor: Color? = nil,
    borderColor: Color? = nil
  ) -> SCBubbleContentButtonStyle {
    SCBubbleContentButtonStyle(
      backgroundColor: backgroundColor,
      foregroundColor: foregroundColor,
      borderColor: borderColor
    )
  }
}

// MARK: - Reactions

/// The reactions capsule that can overlap a bubble's top or bottom edge.
public struct SCBubbleReactions<Content: View>: View {
  @Environment(\.theme) private var theme

  fileprivate let side: SCBubbleReactionsSide
  fileprivate let align: SCBubbleAlignment
  private let accessibilityLabel: String
  private let content: Content

  public init(
    side: SCBubbleReactionsSide = .bottom,
    align: SCBubbleAlignment = .end,
    accessibilityLabel: String = "Reactions",
    @ViewBuilder content: () -> Content
  ) {
    self.side = side
    self.align = align
    self.accessibilityLabel = accessibilityLabel
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: 4) {
      content
    }
    .font(.subheadline)
    .padding(.horizontal, 6)
    .padding(.vertical, 2)
    .background {
      Capsule().fill(theme.card).padding(-3)
      Capsule().fill(theme.muted)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(accessibilityLabel))
  }
}

extension View {
  /// Overlaps a reactions capsule on a bubble's edge — shadcn's
  /// `BubbleReactions`. Upstream positions reactions absolutely inside
  /// `Bubble`; the Swift port is a modifier applied to `SCBubble`.
  ///
  ///     SCBubble(variant: .muted) { SCBubbleContent("Sounds good!") }
  ///         .scBubbleReactions { Text("👍") }
  ///
  /// - Parameters:
  ///   - side: The bubble edge the capsule overlaps. Defaults to `.bottom`.
  ///   - align: The inline end it hugs. Defaults to `.end`.
  ///   - accessibilityLabel: Read by assistive technologies, e.g.
  ///     `"Reactions: thumbs up"`.
  ///   - content: Emoji text or small buttons.
  public func scBubbleReactions(
    side: SCBubbleReactionsSide = .bottom,
    align: SCBubbleAlignment = .end,
    accessibilityLabel: String? = nil,
    @ViewBuilder content: () -> some View
  ) -> some View {
    modifier(
      SCBubbleReactionsModifier(
        reactions: SCBubbleReactions(
          side: side,
          align: align,
          accessibilityLabel: accessibilityLabel ?? "Reactions",
          content: content
        )
      )
    )
  }
}

private struct SCBubbleReactionsModifier<Reactions: View>: ViewModifier {
  var reactions: SCBubbleReactions<Reactions>

  func body(content: Content) -> some View {
    content.overlay(alignment: overlayAlignment) {
      reactions
        .alignmentGuide(
          reactions.side == .bottom
            ? VerticalAlignment.bottom : VerticalAlignment.top
        ) { dimensions in
          // Hang 75% of the capsule outside the bubble edge,
          // mirroring upstream's translate-y-3/4.
          reactions.side == .bottom
            ? dimensions.height * 0.25 : dimensions.height * 0.75
        }
        .padding(reactions.align == .end ? .trailing : .leading, 12)
    }
  }

  private var overlayAlignment: Alignment {
    switch (reactions.side, reactions.align) {
    case (.bottom, .end): .bottomTrailing
    case (.bottom, .start): .bottomLeading
    case (.top, .end): .topTrailing
    case (.top, .start): .topLeading
    }
  }
}

// MARK: - Width cap

/// Proposes at most `fraction` of the available width to its child while
/// still sizing to fit — the SwiftUI equivalent of `w-fit max-w-[80%]`.
private struct SCBubbleWidthCap<Content: View>: View {
  var fraction: CGFloat
  @ViewBuilder var content: Content

  var body: some View {
    SCBubbleWidthCapLayout(fraction: fraction) {
      content
    }
  }
}

private struct SCBubbleWidthCapLayout: Layout {
  var fraction: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let subview = subviews.first else { return .zero }
    return subview.sizeThatFits(capped(proposal))
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    guard let subview = subviews.first else { return }
    subview.place(
      at: bounds.origin,
      anchor: .topLeading,
      proposal: ProposedViewSize(width: bounds.width, height: bounds.height)
    )
  }

  private func capped(_ proposal: ProposedViewSize) -> ProposedViewSize {
    var capped = proposal
    if let width = proposal.width, width.isFinite {
      capped.width = width * fraction
    }
    return capped
  }
}
