// ============================================================
// DropdownMenu.swift — swiftcn-ui
// ============================================================
import SwiftUI

// MARK: - Configuration

/// The semantic treatment of a dropdown-menu action.
public enum SCDropdownMenuItemVariant: Hashable, Sendable {
  case `default`
  case destructive

  fileprivate var role: ButtonRole? {
    self == .destructive ? .destructive : nil
  }
}

/// A real native keyboard shortcut attached to a dropdown-menu action.
public struct SCDropdownMenuShortcut {
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

// MARK: - Root, trigger, and content

/// A native dropdown menu with independently composable trigger and content.
///
/// SwiftUI's `Menu` owns presentation, placement, dismissal, pointer and touch
/// interaction, keyboard navigation, focus, RTL submenu direction, and
/// accessibility. The public parts below compose those native primitives
/// without creating a second menu state machine.
public struct SCDropdownMenu<Trigger: View, MenuContent: View>: View {
  private let showsIndicator: Bool
  private let order: MenuOrder
  private let trigger: Trigger
  private let menuContent: MenuContent

  public init(
    showsIndicator: Bool = false,
    order: MenuOrder = .automatic,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder content: () -> MenuContent
  ) {
    self.showsIndicator = showsIndicator
    self.order = order
    self.trigger = trigger()
    self.menuContent = content()
  }

  public var body: some View {
    Menu {
      menuContent
    } label: {
      trigger
    }
    .menuOrder(order)
    .menuIndicator(showsIndicator ? .visible : .hidden)
  }
}

/// The arbitrary label used by an `SCDropdownMenu` as its native trigger.
public struct SCDropdownMenuTrigger<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View { content }
}

/// The caller-composed native menu content.
public struct SCDropdownMenuContent<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View { content }
}

// MARK: - Groups and labels

/// A native menu section with an optional arbitrary heading.
public struct SCDropdownMenuGroup<Label: View, Content: View>: View {
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

extension SCDropdownMenuGroup where Label == EmptyView {
  /// Creates an unlabeled group while retaining native section semantics.
  public init(@ViewBuilder content: () -> Content) {
    self.init(label: { EmptyView() }, content: content)
  }
}

extension SCDropdownMenuGroup where Label == Text {
  /// Convenience for a plain-text group heading.
  public init(
    _ label: String,
    @ViewBuilder content: () -> Content
  ) {
    self.init(label: { Text(label) }, content: content)
  }
}

/// A standalone semantic label for compositions that do not need a Section.
/// Prefer the label slot on `SCDropdownMenuGroup` when grouping menu items.
public struct SCDropdownMenuLabel<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View { content }
}

// MARK: - Items

/// A native menu action with disabled, destructive, and keyboard-shortcut
/// behavior. Icons can be composed into the arbitrary label with `Label`.
public struct SCDropdownMenuItem<Label: View>: View {
  private let variant: SCDropdownMenuItemVariant
  private let isDisabled: Bool
  private let shortcut: SCDropdownMenuShortcut?
  private let action: () -> Void
  private let label: Label

  public init(
    variant: SCDropdownMenuItemVariant = .default,
    isDisabled: Bool = false,
    shortcut: SCDropdownMenuShortcut? = nil,
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
    Button(role: variant.role, action: action) {
      label
    }
    .disabled(isDisabled)
  }
}

extension SCDropdownMenuItem where Label == Text {
  /// Convenience for a plain-text native menu action.
  public init(
    _ title: String,
    variant: SCDropdownMenuItemVariant = .default,
    isDisabled: Bool = false,
    shortcut: SCDropdownMenuShortcut? = nil,
    action: @escaping () -> Void
  ) {
    self.init(
      variant: variant,
      isDisabled: isDisabled,
      shortcut: shortcut,
      action: action
    ) { Text(title) }
  }
}

/// A caller-controlled native checkbox menu item.
public struct SCDropdownMenuCheckboxItem<Label: View>: View {
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
    Toggle(isOn: $isChecked) {
      label
    }
    .disabled(isDisabled)
  }
}

extension SCDropdownMenuCheckboxItem where Label == Text {
  /// Convenience for a plain-text checkbox item.
  public init(
    _ title: String,
    isChecked: Binding<Bool>,
    isDisabled: Bool = false
  ) {
    self.init(isChecked: isChecked, isDisabled: isDisabled) {
      Text(title)
    }
  }
}

/// A caller-controlled native radio group backed by an inline `Picker`.
public struct SCDropdownMenuRadioGroup<Value: Hashable, Content: View>: View {
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
    Picker(title, selection: $selection) {
      content
    }
    .pickerStyle(.inline)
  }
}

/// One tagged choice inside `SCDropdownMenuRadioGroup`.
public struct SCDropdownMenuRadioItem<Value: Hashable, Content: View>: View {
  private let value: Value
  private let isDisabled: Bool
  private let content: Content

  public init(
    value: Value,
    isDisabled: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.value = value
    self.isDisabled = isDisabled
    self.content = content()
  }

  public var body: some View {
    content
      .tag(value)
      .disabled(isDisabled)
  }
}

extension SCDropdownMenuRadioItem where Content == Text {
  /// Convenience for a plain-text radio item.
  public init(
    _ title: String,
    value: Value,
    isDisabled: Bool = false
  ) {
    self.init(value: value, isDisabled: isDisabled) {
      Text(title)
    }
  }
}

// MARK: - Submenus

/// A real native submenu. The platform owns hover delay, keyboard navigation,
/// placement, RTL direction, dismissal, and accessibility.
public struct SCDropdownMenuSub<Trigger: View, Content: View>: View {
  private let isDisabled: Bool
  private let trigger: Trigger
  private let content: Content

  public init(
    isDisabled: Bool = false,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder content: () -> Content
  ) {
    self.isDisabled = isDisabled
    self.trigger = trigger()
    self.content = content()
  }

  public var body: some View {
    Menu {
      content
    } label: {
      trigger
    }
    .disabled(isDisabled)
  }
}

/// The arbitrary label supplied to a native submenu.
public struct SCDropdownMenuSubTrigger<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View { content }
}

/// The caller-composed contents of a native submenu.
public struct SCDropdownMenuSubContent<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View { content }
}

/// A native menu separator.
public struct SCDropdownMenuSeparator: View {
  public init() {}

  public var body: some View { Divider() }
}
