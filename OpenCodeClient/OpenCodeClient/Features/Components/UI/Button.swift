// ============================================================
// Button.swift — swiftcn-ui
// Depends on: Theme/
// ============================================================
import SwiftUI

// MARK: - Variants

public enum SCButtonVariant: CaseIterable, Sendable {
  case `default`, destructive, outline, secondary, ghost, link
}

public enum SCButtonSize: CaseIterable, Sendable {
  case `default`, xs, sm, lg, icon, iconXS, iconSM, iconLG
}

// MARK: - Style

/// swiftcn's button appearance for native SwiftUI `Button`s — the cva
/// `buttonVariants` of this library. Behavior and accessibility stay native;
/// this supplies the style layer only.
///
///     Button("Continue") { … }.buttonStyle(.sc())
///     Button("Delete") { … }.buttonStyle(.sc(.destructive))
///     Button("Cancel") { … }.buttonStyle(.sc(.outline, size: .sm))
public struct SCButtonStyle: ButtonStyle {
  var variant: SCButtonVariant
  var size: SCButtonSize

  public init(variant: SCButtonVariant = .default, size: SCButtonSize = .default) {
    self.variant = variant
    self.size = size
  }

  public func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .modifier(
        SCButtonChrome(
          variant: variant,
          size: size,
          isPressed: configuration.isPressed
        ))
  }
}

private struct SCButtonChrome: ViewModifier {
  @Environment(\.theme) private var theme
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.isFocused) private var isFocused
  @Environment(\.scGroupedControlOrientation) private var groupOrientation

  let variant: SCButtonVariant
  let size: SCButtonSize
  let isPressed: Bool

  @State private var isHovered = false

  func body(content: Content) -> some View {
    content
      .font(font)
      .lineLimit(1)
      .padding(padding)
      .frame(minWidth: isIconOnly ? height : nil, minHeight: height)
      .frame(maxWidth: groupOrientation == .vertical ? .infinity : nil)
      .background(background, in: shape)
      .overlay { border }
      .overlay { focusRing }
      .foregroundStyle(foreground)
      .underline(variant == .link && (isHovered || isPressed))
      .contentShape(shape)
      .opacity(isEnabled ? 1 : 0.5)
      .onHover { isHovered = $0 }
      .animation(.easeOut(duration: 0.12), value: isHovered)
      .animation(.easeOut(duration: 0.12), value: isPressed)
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(
      cornerRadius: groupOrientation == nil ? max(theme.radius - 2, 4) : 0,
      style: .continuous
    )
  }

  private var background: Color {
    let hovering = isHovered && isEnabled
    switch variant {
    case .default:
      return isPressed
        ? theme.primary.opacity(0.85) : theme.primary.opacity(hovering ? 0.9 : 1)
    case .destructive:
      return isPressed
        ? theme.destructive.opacity(0.85) : theme.destructive.opacity(hovering ? 0.9 : 1)
    case .secondary:
      return isPressed
        ? theme.secondary.opacity(0.7) : theme.secondary.opacity(hovering ? 0.8 : 1)
    case .outline:
      return isPressed || hovering ? theme.accent : theme.background
    case .ghost:
      return isPressed || hovering ? theme.accent : .clear
    case .link:
      return .clear
    }
  }

  private var foreground: Color {
    switch variant {
    case .default: theme.primaryForeground
    case .destructive: theme.destructiveForeground
    case .secondary: theme.secondaryForeground
    case .outline, .ghost:
      isHovered && isEnabled ? theme.accentForeground : theme.foreground
    case .link: theme.primary
    }
  }

  @ViewBuilder
  private var border: some View {
    if variant == .outline {
      shape.strokeBorder(theme.border)
    }
  }

  @ViewBuilder
  private var focusRing: some View {
    if isFocused {
      shape.strokeBorder(theme.ring.opacity(0.5), lineWidth: 3)
    }
  }

  private var font: Font {
    switch size {
    case .xs, .iconXS: .caption.weight(.medium)
    case .sm, .iconSM: .footnote.weight(.medium)
    default: .subheadline.weight(.medium)
    }
  }

  private var padding: EdgeInsets {
    switch size {
    case .default: EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16)
    case .xs: EdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8)
    case .sm: EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12)
    case .lg: EdgeInsets(top: 8, leading: 24, bottom: 8, trailing: 24)
    case .icon, .iconXS, .iconSM, .iconLG: EdgeInsets()
    }
  }

  private var height: CGFloat {
    switch size {
    case .default, .icon: 36
    case .xs, .iconXS: 24
    case .sm, .iconSM: 32
    case .lg, .iconLG: 40
    }
  }

  private var isIconOnly: Bool {
    switch size {
    case .icon, .iconXS, .iconSM, .iconLG: true
    default: false
    }
  }
}

extension ButtonStyle where Self == SCButtonStyle {
  public static func sc(_ variant: SCButtonVariant = .default, size: SCButtonSize = .default) -> SCButtonStyle {
    SCButtonStyle(variant: variant, size: size)
  }
}
