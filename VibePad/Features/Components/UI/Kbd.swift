// ============================================================
// Kbd.swift — swiftcn-ui
// Depends on: Theme/
// ============================================================
import SwiftUI

// MARK: - Native key vocabulary

/// Commonly displayed keyboard keys with stable visual and spoken labels.
public enum SCKbdKey: Equatable, Hashable, Sendable {
  case command
  case control
  case option
  case shift
  case capsLock
  case escape
  case tab
  case returnKey
  case delete
  case forwardDelete
  case space
  case arrowUp
  case arrowDown
  case arrowLeft
  case arrowRight
  case character(String)

  public var displayValue: String {
    switch self {
    case .command: "⌘"
    case .control: "⌃"
    case .option: "⌥"
    case .shift: "⇧"
    case .capsLock: "⇪"
    case .escape: "Esc"
    case .tab: "⇥"
    case .returnKey: "↩"
    case .delete: "⌫"
    case .forwardDelete: "⌦"
    case .space: "Space"
    case .arrowUp: "↑"
    case .arrowDown: "↓"
    case .arrowLeft: "←"
    case .arrowRight: "→"
    case .character(let value): value
    }
  }

  public var accessibilityLabel: String {
    switch self {
    case .command: "Command"
    case .control: "Control"
    case .option: "Option"
    case .shift: "Shift"
    case .capsLock: "Caps Lock"
    case .escape: "Escape"
    case .tab: "Tab"
    case .returnKey: "Return"
    case .delete: "Delete"
    case .forwardDelete: "Forward Delete"
    case .space: "Space"
    case .arrowUp: "Up Arrow"
    case .arrowDown: "Down Arrow"
    case .arrowLeft: "Left Arrow"
    case .arrowRight: "Right Arrow"
    case .character(let value): value
    }
  }
}

// MARK: - Keycap

/// A presentational keyboard keycap with arbitrary content. Apply an actual
/// `.keyboardShortcut` to the Button, Toggle, or command that owns the action;
/// this view intentionally does not install behavior by itself.
public struct SCKbd<Content: View>: View {
  @Environment(\.theme) private var theme

  private let explicitAccessibilityLabel: String?
  private let content: Content

  public init(
    accessibilityLabel: String? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.explicitAccessibilityLabel = accessibilityLabel
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: 4) { content }
      .font(.caption2.weight(.medium).monospaced())
      .lineLimit(1)
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .foregroundStyle(theme.mutedForeground)
      .background(theme.muted, in: shape)
      .overlay { shape.strokeBorder(theme.border) }
      .fixedSize()
      .allowsHitTesting(false)
      .accessibilityElement(children: .combine)
      .modifier(SCKbdAccessibilityLabel(label: explicitAccessibilityLabel))
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: max(min(theme.radius - 4, 6), 4), style: .continuous)
  }
}

extension SCKbd where Content == Text {
  public init(_ key: String, accessibilityLabel: String? = nil) {
    self.init(accessibilityLabel: accessibilityLabel) { Text(key) }
  }

  public init(_ key: SCKbdKey) {
    self.init(accessibilityLabel: key.accessibilityLabel) {
      Text(key.displayValue)
    }
  }
}

private struct SCKbdAccessibilityLabel: ViewModifier {
  let label: String?

  @ViewBuilder
  func body(content: Content) -> some View {
    if let label {
      // Keycaps read as static text. An explicitly labeled group is
      // represented as text so it carries a valid role even when its
      // keys are icon-only and combine into a role-less element.
      content.accessibilityRepresentation { Text(label) }
    } else {
      content
    }
  }
}

// MARK: - Group

/// A caller-composed row of keycaps read as one keyboard shortcut.
public struct SCKbdGroup<Content: View>: View {
  private let spacing: CGFloat
  private let accessibilityLabel: String?
  private let content: Content

  public init(
    spacing: CGFloat = 4,
    accessibilityLabel: String? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.spacing = spacing
    self.accessibilityLabel = accessibilityLabel
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: spacing) { content }
      .fixedSize()
      .accessibilityElement(children: .combine)
      .modifier(SCKbdAccessibilityLabel(label: accessibilityLabel))
  }
}

extension SCKbdGroup where Content == AnyView {
  /// A concise string-array composition over the same public Group and Kbd.
  public init(_ keys: [String], spacing: CGFloat = 4) {
    self.init(spacing: spacing) {
      AnyView(
        ForEach(Array(keys.enumerated()), id: \.offset) { _, key in
          SCKbd(key)
        }
      )
    }
  }

  /// A concise typed-key composition with complete spoken labels.
  public init(_ keys: [SCKbdKey], spacing: CGFloat = 4) {
    self.init(
      spacing: spacing,
      accessibilityLabel: keys.map(\.accessibilityLabel).joined(separator: ", ")
    ) {
      AnyView(
        ForEach(Array(keys.enumerated()), id: \.offset) { _, key in
          SCKbd(key)
        }
      )
    }
  }
}
