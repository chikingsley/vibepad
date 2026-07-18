// ============================================================
// ContextMenu.swift — swiftcn-ui
// Depends on: Theme/
// ============================================================
import SwiftUI

/// The semantic treatment of a context-menu action.
public enum SCContextMenuItemVariant: Hashable, Sendable {
  case `default`
  case destructive

  fileprivate var role: ButtonRole? {
    self == .destructive ? .destructive : nil
  }
}

/// A real native keyboard shortcut attached to a context-menu action.
public struct SCContextMenuShortcut: Sendable {
  public let key: KeyEquivalent
  public let modifiers: EventModifiers

  public init(
    _ key: KeyEquivalent,
    modifiers: EventModifiers = .command
  ) {
    self.key = key
    self.modifiers = modifiers
  }
}

/// Attaches native context-menu content to an arbitrary trigger view.
///
/// SwiftUI's context-menu presentation owns pointer, long-press, keyboard,
/// focus, placement, dismissal, and accessibility behavior on each platform.
public struct SCContextMenu<Trigger: View, MenuContent: View>: View {
  private let trigger: Trigger
  private let menuContent: () -> MenuContent

  public init(
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder content: @escaping () -> MenuContent
  ) {
    self.trigger = trigger()
    self.menuContent = content
  }

  public var body: some View {
    trigger.contextMenu { menuContent() }
  }
}

extension View {
  /// Attaches caller-composed native context-menu content to this view.
  public func scContextMenu<MenuContent: View>(
    @ViewBuilder content: @escaping () -> MenuContent
  ) -> some View {
    contextMenu { content() }
  }
}

/// A native context-menu action with optional destructive role and shortcut.
public struct SCContextMenuItem<Label: View>: View {
  private let variant: SCContextMenuItemVariant
  private let isDisabled: Bool
  private let shortcut: SCContextMenuShortcut?
  private let action: () -> Void
  private let label: Label

  public init(
    variant: SCContextMenuItemVariant = .default,
    isDisabled: Bool = false,
    shortcut: SCContextMenuShortcut? = nil,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) {
    self.variant = variant
    self.isDisabled = isDisabled
    self.shortcut = shortcut
    self.action = action
    self.label = label()
  }

  @ViewBuilder
  public var body: some View {
    if let shortcut {
      button.keyboardShortcut(shortcut.key, modifiers: shortcut.modifiers)
    } else {
      button
    }
  }

  private var button: some View {
    Button(role: variant.role, action: action) { label }
      .disabled(isDisabled)
  }
}

/// A caller-controlled native checkbox menu item.
public struct SCContextMenuCheckboxItem<Label: View>: View {
  @Binding private var isChecked: Bool
  private let isDisabled: Bool
  private let label: Label

  public init(
    isChecked: Binding<Bool>,
    isDisabled: Bool = false,
    @ViewBuilder label: () -> Label
  ) {
    self._isChecked = isChecked
    self.isDisabled = isDisabled
    self.label = label()
  }

  public var body: some View {
    Toggle(isOn: $isChecked) { label }
      .disabled(isDisabled)
  }
}

/// A caller-controlled native radio group rendered by a Picker.
public struct SCContextMenuRadioGroup<Value: Hashable, Content: View>: View {
  @Binding private var selection: Value
  private let title: String
  private let content: Content

  public init(
    _ title: String = "Options",
    selection: Binding<Value>,
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self._selection = selection
    self.content = content()
  }

  public var body: some View {
    Picker(title, selection: $selection) { content }
      .pickerStyle(.inline)
  }
}

/// One tagged option inside `SCContextMenuRadioGroup`.
public struct SCContextMenuRadioItem<Value: Hashable, Content: View>: View {
  private let value: Value
  private let content: Content

  public init(
    value: Value,
    @ViewBuilder content: () -> Content
  ) {
    self.value = value
    self.content = content()
  }

  public var body: some View {
    content.tag(value)
  }
}

/// A native menu section with an arbitrary semantic heading.
public struct SCContextMenuGroup<Label: View, Content: View>: View {
  private let label: Label
  private let content: Content

  public init(
    @ViewBuilder label: () -> Label,
    @ViewBuilder content: () -> Content
  ) {
    self.label = label()
    self.content = content()
  }

  public var body: some View {
    Section {
      content
    } header: {
      label
    }
  }
}

extension SCContextMenuGroup where Label == EmptyView {
  /// Creates an unlabeled group while retaining native section semantics.
  public init(@ViewBuilder content: () -> Content) {
    self.init(label: { EmptyView() }, content: content)
  }
}

/// A semantic group heading for context-menu sections.
public struct SCContextMenuLabel<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View { content }
}

/// A real native submenu backed by `Menu`.
public struct SCContextMenuSub<Label: View, Content: View>: View {
  private let isDisabled: Bool
  private let label: Label
  private let content: Content

  public init(
    isDisabled: Bool = false,
    @ViewBuilder label: () -> Label,
    @ViewBuilder content: () -> Content
  ) {
    self.isDisabled = isDisabled
    self.label = label()
    self.content = content()
  }

  public var body: some View {
    Menu {
      content
    } label: {
      label
    }
    .disabled(isDisabled)
  }
}

/// A native context-menu divider.
public struct SCContextMenuSeparator: View {
  public init() {}

  public var body: some View { Divider() }
}
