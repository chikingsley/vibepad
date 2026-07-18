// ============================================================
// ItemParts.swift — swiftcn-ui
// Supplemental source for: item
// ============================================================
import SwiftUI

// MARK: - Native interactive roots

private struct SCItemInteractiveButtonStyle: ButtonStyle {
  let isFocused: Bool

  func makeBody(configuration: Configuration) -> some View {
    SCItemInteractiveLabel(
      label: configuration.label,
      isPressed: configuration.isPressed,
      isFocused: isFocused
    )
  }
}

private struct SCItemInteractiveLabel<Label: View>: View {
  let label: Label
  let isPressed: Bool
  let isFocused: Bool

  @State private var isHovered = false

  var body: some View {
    label
      .environment(
        \.scItemInteractionState,
        SCItemInteractionState(
          isInteractive: true,
          isHovered: isHovered,
          isPressed: isPressed,
          isFocused: isFocused
        )
      )
      .onHover { isHovered = $0 }
  }
}

/// A real native Button whose label uses the same Item root and public parts.
public struct SCItemButton<Content: View>: View {
  @FocusState private var isFocused: Bool

  private let role: ButtonRole?
  private let action: () -> Void
  private let variant: SCItemVariant
  private let size: SCItemSize
  private let content: Content

  public init(
    role: ButtonRole? = nil,
    variant: SCItemVariant = .default,
    size: SCItemSize = .default,
    action: @escaping () -> Void,
    @ViewBuilder content: () -> Content
  ) {
    self.role = role
    self.action = action
    self.variant = variant
    self.size = size
    self.content = content()
  }

  public var body: some View {
    Button(role: role, action: action) {
      SCItem(variant: variant, size: size) { content }
    }
    .buttonStyle(SCItemInteractiveButtonStyle(isFocused: isFocused))
    .focused($isFocused)
  }
}

/// A real native Link whose label uses the same Item root and public parts.
public struct SCItemLink<Content: View>: View {
  @FocusState private var isFocused: Bool

  private let destination: URL
  private let variant: SCItemVariant
  private let size: SCItemSize
  private let content: Content

  public init(
    destination: URL,
    variant: SCItemVariant = .default,
    size: SCItemSize = .default,
    @ViewBuilder content: () -> Content
  ) {
    self.destination = destination
    self.variant = variant
    self.size = size
    self.content = content()
  }

  public var body: some View {
    Link(destination: destination) {
      SCItem(variant: variant, size: size) { content }
    }
    .buttonStyle(SCItemInteractiveButtonStyle(isFocused: isFocused))
    .focused($isFocused)
  }
}

/// A real native NavigationLink whose label uses the same Item root and parts.
public struct SCItemNavigationLink<Destination: View, Content: View>: View {
  @FocusState private var isFocused: Bool

  private let variant: SCItemVariant
  private let size: SCItemSize
  private let destination: Destination
  private let content: Content

  public init(
    variant: SCItemVariant = .default,
    size: SCItemSize = .default,
    @ViewBuilder destination: () -> Destination,
    @ViewBuilder content: () -> Content
  ) {
    self.variant = variant
    self.size = size
    self.destination = destination()
    self.content = content()
  }

  public var body: some View {
    NavigationLink {
      destination
    } label: {
      SCItem(variant: variant, size: size) { content }
    }
    .buttonStyle(SCItemInteractiveButtonStyle(isFocused: isFocused))
    .focused($isFocused)
  }
}
