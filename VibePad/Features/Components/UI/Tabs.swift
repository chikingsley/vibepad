// ============================================================
// Tabs.swift — swiftcn-ui
// Depends on: Theme/
// ============================================================
import SwiftUI

// MARK: - Configuration

public enum SCTabsVariant: CaseIterable, Sendable {
  /// shadcn's default muted strip with a raised active tab.
  case segmented
  /// shadcn's line variant with an active edge indicator.
  case underline

  public static var `default`: SCTabsVariant { .segmented }
  public static var line: SCTabsVariant { .underline }
}

public enum SCTabsOrientation: Hashable, Sendable {
  case horizontal
  case vertical
}

// MARK: - Compatibility item

/// A data-driven tab used by `SCTabs`' compatibility initializer.
public struct SCTabItem<Value: Hashable>: Identifiable {
  public var value: Value
  public var label: String
  public var systemImage: String?
  public var isDisabled: Bool

  public var id: Value { value }

  public init(
    value: Value,
    label: String,
    systemImage: String? = nil,
    isDisabled: Bool = false
  ) {
    self.value = value
    self.label = label
    self.systemImage = systemImage
    self.isDisabled = isDisabled
  }
}

// MARK: - Shared state

private final class SCTabsKeyboardCoordinator {
  private struct Entry {
    let id: UUID
    var value: AnyHashable
    var isDisabled: Bool
    var focus: () -> Void
    var activate: () -> Void
  }

  private var entries: [Entry] = []

  func register(
    id: UUID,
    value: AnyHashable,
    isDisabled: Bool,
    focus: @escaping () -> Void,
    activate: @escaping () -> Void
  ) {
    if let index = entries.firstIndex(where: { $0.id == id }) {
      entries[index].value = value
      entries[index].isDisabled = isDisabled
      entries[index].focus = focus
      entries[index].activate = activate
    } else {
      entries.append(
        Entry(
          id: id,
          value: value,
          isDisabled: isDisabled,
          focus: focus,
          activate: activate
        )
      )
    }
  }

  func unregister(id: UUID) {
    entries.removeAll { $0.id == id }
  }

  func move(
    from id: UUID,
    offset: Int,
    loops: Bool,
    activates: Bool
  ) {
    guard
      !entries.isEmpty,
      offset != 0,
      let currentIndex = entries.firstIndex(where: { $0.id == id })
    else { return }

    for step in 1...entries.count {
      let candidate = currentIndex + offset * step
      let index: Int
      if loops {
        index = (candidate % entries.count + entries.count) % entries.count
      } else {
        guard entries.indices.contains(candidate) else { return }
        index = candidate
      }
      guard !entries[index].isDisabled else { continue }
      entries[index].focus()
      if activates { entries[index].activate() }
      return
    }
  }

  func firstEnabledValue() -> AnyHashable? {
    entries.first(where: { !$0.isDisabled })?.value
  }

  func containsEnabled(_ value: AnyHashable) -> Bool {
    entries.contains { $0.value == value && !$0.isDisabled }
  }
}

private struct SCTabsRootContext {
  var selectedValue: AnyHashable?
  var orientation: SCTabsOrientation = .horizontal
  var select: (AnyHashable) -> Void = { _ in }
  var register:
    (
      UUID,
      AnyHashable,
      Bool,
      @escaping () -> Void,
      @escaping () -> Void
    ) -> Void = { _, _, _, _, _ in }
  var unregister: (UUID) -> Void = { _ in }
  var move: (UUID, Int, Bool, Bool) -> Void = { _, _, _, _ in }
  var reconcileSelection: () -> Void = {}
}

private struct SCTabsRootContextKey: EnvironmentKey {
  static var defaultValue: SCTabsRootContext? { nil }
}

private struct SCTabsListContext {
  var variant: SCTabsVariant = .segmented
  var activateOnFocus = false
  var loopsFocus = true
}

private struct SCTabsListContextKey: EnvironmentKey {
  static let defaultValue = SCTabsListContext()
}

extension EnvironmentValues {
  fileprivate var scTabsRootContext: SCTabsRootContext? {
    get { self[SCTabsRootContextKey.self] }
    set { self[SCTabsRootContextKey.self] = newValue }
  }

  fileprivate var scTabsListContext: SCTabsListContext {
    get { self[SCTabsListContextKey.self] }
    set { self[SCTabsListContextKey.self] = newValue }
  }
}

// MARK: - Root

/// Groups a composed tab list and its matching content panels.
///
///     SCTabs(selection: $tab) {
///         SCTabsList {
///             SCTabsTrigger(value: "account") { Text("Account") }
///             SCTabsTrigger(value: "password") { Text("Password") }
///         }
///         SCTabsContent(value: "account") { AccountView() }
///         SCTabsContent(value: "password") { PasswordView() }
///     }
public struct SCTabs<Value: Hashable, Content: View>: View {
  @State private var internalSelection: Value?
  @State private var keyboard = SCTabsKeyboardCoordinator()
  @State private var reconcileTask: Task<Void, Never>?

  private enum Selection {
    case required(Binding<Value>)
    case optional(Binding<Value?>)
    case internalState
  }

  private let selection: Selection
  private let orientation: SCTabsOrientation
  private let spacing: CGFloat
  private let onValueChange: (Value?) -> Void
  private let content: Content

  /// Creates a controlled root whose selection is always non-optional.
  public init(
    selection: Binding<Value>,
    orientation: SCTabsOrientation = .horizontal,
    spacing: CGFloat = 8,
    onValueChange: ((Value) -> Void)? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.selection = .required(selection)
    self._internalSelection = State(initialValue: selection.wrappedValue)
    self.orientation = orientation
    self.spacing = max(spacing, 0)
    self.onValueChange = { value in
      if let value { onValueChange?(value) }
    }
    self.content = content()
  }

  /// Creates a controlled root that permits no active tab.
  public init(
    selection: Binding<Value?>,
    orientation: SCTabsOrientation = .horizontal,
    spacing: CGFloat = 8,
    onValueChange: ((Value?) -> Void)? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.selection = .optional(selection)
    self._internalSelection = State(initialValue: selection.wrappedValue)
    self.orientation = orientation
    self.spacing = max(spacing, 0)
    self.onValueChange = { onValueChange?($0) }
    self.content = content()
  }

  /// Creates an internally managed root. When `defaultValue` is nil or is not
  /// an enabled mounted trigger, the first enabled trigger is selected.
  public init(
    defaultValue: Value? = nil,
    orientation: SCTabsOrientation = .horizontal,
    spacing: CGFloat = 8,
    onValueChange: ((Value?) -> Void)? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.selection = .internalState
    self._internalSelection = State(initialValue: defaultValue)
    self.orientation = orientation
    self.spacing = max(spacing, 0)
    self.onValueChange = { onValueChange?($0) }
    self.content = content()
  }

  public var body: some View {
    laidOutContent
      .environment(\.scTabsRootContext, context)
      .onAppear { reconcileSelection() }
      .onDisappear { reconcileTask?.cancel() }
  }

  @ViewBuilder
  private var laidOutContent: some View {
    switch orientation {
    case .horizontal:
      VStack(alignment: .leading, spacing: spacing) { content }
    case .vertical:
      HStack(alignment: .top, spacing: spacing) { content }
    }
  }

  private var selectedValue: Value? {
    switch selection {
    case .required(let binding): binding.wrappedValue
    case .optional(let binding): binding.wrappedValue
    case .internalState: internalSelection
    }
  }

  private var context: SCTabsRootContext {
    SCTabsRootContext(
      selectedValue: selectedValue.map(AnyHashable.init),
      orientation: orientation,
      select: select,
      register: { id, value, isDisabled, focus, activate in
        keyboard.register(
          id: id,
          value: value,
          isDisabled: isDisabled,
          focus: focus,
          activate: activate
        )
      },
      unregister: { id in keyboard.unregister(id: id) },
      move: { id, offset, loops, activates in
        keyboard.move(from: id, offset: offset, loops: loops, activates: activates)
      },
      reconcileSelection: reconcileSelection
    )
  }

  private func select(_ erasedValue: AnyHashable) {
    guard let value = erasedValue.base as? Value, value != selectedValue else { return }

    switch selection {
    case .required(let binding): binding.wrappedValue = value
    case .optional(let binding): binding.wrappedValue = value
    case .internalState: internalSelection = value
    }
    onValueChange(value)
  }

  private func reconcileSelection() {
    guard case .internalState = selection else { return }
    reconcileTask?.cancel()
    reconcileTask = Task { @MainActor in
      await Task.yield()
      guard !Task.isCancelled else { return }
      let hasEnabledSelection =
        selectedValue.map {
          keyboard.containsEnabled(AnyHashable($0))
        } ?? false
      if hasEnabledSelection {
        return
      }
      guard let fallback = keyboard.firstEnabledValue() else {
        if internalSelection != nil {
          internalSelection = nil
          onValueChange(nil)
        }
        return
      }
      select(fallback)
    }
  }
}

// MARK: - List

/// Groups tab triggers and owns their visual variant and focus policy.
public struct SCTabsList<Content: View>: View {
  @Environment(\.scTabsRootContext) private var root
  @Environment(\.theme) private var theme

  private let variant: SCTabsVariant
  private let spacing: CGFloat
  private let activateOnFocus: Bool
  private let loopsFocus: Bool
  private let content: Content

  public init(
    variant: SCTabsVariant = .segmented,
    spacing: CGFloat = 0,
    activateOnFocus: Bool = false,
    loopsFocus: Bool = true,
    @ViewBuilder content: () -> Content
  ) {
    self.variant = variant
    self.spacing = max(spacing, 0)
    self.activateOnFocus = activateOnFocus
    self.loopsFocus = loopsFocus
    self.content = content()
  }

  public var body: some View {
    laidOutContent
      .padding(variant == .segmented ? 4 : 0)
      .background {
        if variant == .segmented {
          RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
            .fill(theme.muted)
        }
      }
      .background(alignment: listRuleAlignment) {
        if variant == .underline {
          Rectangle()
            .fill(theme.border)
            .frame(
              width: root?.orientation == .vertical ? 1 : nil,
              height: root?.orientation == .horizontal ? 1 : nil
            )
        }
      }
      .environment(
        \.scTabsListContext,
        SCTabsListContext(
          variant: variant,
          activateOnFocus: activateOnFocus,
          loopsFocus: loopsFocus
        )
      )
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Tabs")
  }

  @ViewBuilder
  private var laidOutContent: some View {
    switch root?.orientation ?? .horizontal {
    case .horizontal:
      HStack(spacing: spacing) { content }
    case .vertical:
      VStack(alignment: .leading, spacing: spacing) { content }
    }
  }

  private var listRuleAlignment: Alignment {
    root?.orientation == .vertical ? .trailing : .bottom
  }
}

// MARK: - Trigger

/// A native Button tab trigger with a typed value and arbitrary label.
public struct SCTabsTrigger<Value: Hashable, Label: View>: View {
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.layoutDirection) private var layoutDirection
  @Environment(\.scTabsListContext) private var list
  @Environment(\.scTabsRootContext) private var root
  @Environment(\.theme) private var theme
  @FocusState private var isFocused: Bool
  @State private var registrationID = UUID()

  private let value: Value
  private let isDisabled: Bool
  private let accessibilityLabel: String?
  private let label: Label

  public init(
    value: Value,
    isDisabled: Bool = false,
    accessibilityLabel: String? = nil,
    @ViewBuilder label: () -> Label
  ) {
    self.value = value
    self.isDisabled = isDisabled
    self.accessibilityLabel = accessibilityLabel
    self.label = label()
  }

  public var body: some View {
    labelledButton
      .buttonStyle(.plain)
      .disabled(effectiveDisabled)
      .focused($isFocused)
      .accessibilityAddTraits(isSelected ? .isSelected : [])
      .accessibilityValue(isSelected ? "Selected" : "Not selected")
      .onKeyPress(.upArrow) { moveOnVertical(-1) }
      .onKeyPress(.downArrow) { moveOnVertical(1) }
      .onKeyPress(.leftArrow) {
        moveOnHorizontal(layoutDirection == .leftToRight ? -1 : 1)
      }
      .onKeyPress(.rightArrow) {
        moveOnHorizontal(layoutDirection == .leftToRight ? 1 : -1)
      }
      .onAppear { register() }
      .onChange(of: effectiveDisabled) { _, _ in
        register()
        root?.reconcileSelection()
      }
      .onDisappear {
        root?.unregister(registrationID)
        root?.reconcileSelection()
      }
  }

  @ViewBuilder
  private var labelledButton: some View {
    if let accessibilityLabel {
      button.accessibilityLabel(accessibilityLabel)
    } else {
      button
    }
  }

  private var button: some View {
    Button(action: activate) {
      label
        .font(.subheadline.weight(.medium))
        .lineLimit(1)
        .foregroundStyle(isSelected ? theme.foreground : theme.mutedForeground)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(
          maxWidth: root?.orientation == .vertical ? .infinity : nil,
          alignment: .leading
        )
        .background {
          if list.variant == .segmented, isSelected {
            RoundedRectangle(
              cornerRadius: max(theme.radius - 4, 2),
              style: .continuous
            )
            .fill(theme.background)
            .shadow(color: theme.foreground.opacity(0.08), radius: 2, y: 1)
          }
        }
        .overlay(alignment: indicatorAlignment) {
          if list.variant == .underline, isSelected {
            Rectangle()
              .fill(theme.primary)
              .frame(
                width: root?.orientation == .vertical ? 2 : nil,
                height: root?.orientation == .horizontal ? 2 : nil
              )
          }
        }
        .overlay {
          if isFocused {
            RoundedRectangle(cornerRadius: max(theme.radius - 4, 2))
              .stroke(theme.ring, lineWidth: 2)
          }
        }
        .contentShape(Rectangle())
    }
  }

  private var isSelected: Bool {
    root?.selectedValue == AnyHashable(value)
  }

  private var effectiveDisabled: Bool {
    !isEnabled || isDisabled || root == nil
  }

  private var indicatorAlignment: Alignment {
    root?.orientation == .vertical ? .trailing : .bottom
  }

  private func activate() {
    guard !effectiveDisabled else { return }
    root?.select(AnyHashable(value))
  }

  private func moveOnVertical(_ offset: Int) -> KeyPress.Result {
    guard root?.orientation == .vertical else { return .ignored }
    root?.move(registrationID, offset, list.loopsFocus, list.activateOnFocus)
    return .handled
  }

  private func moveOnHorizontal(_ offset: Int) -> KeyPress.Result {
    guard root?.orientation == .horizontal else { return .ignored }
    root?.move(registrationID, offset, list.loopsFocus, list.activateOnFocus)
    return .handled
  }

  private func register() {
    root?.register(
      registrationID,
      AnyHashable(value),
      effectiveDisabled,
      { isFocused = true },
      activate
    )
  }
}

extension SCTabsTrigger where Label == Text {
  public init(_ title: String, value: Value, isDisabled: Bool = false) {
    self.init(value: value, isDisabled: isDisabled, accessibilityLabel: title) {
      Text(title)
    }
  }
}

// MARK: - Content

/// A panel displayed only while its matching trigger value is active.
public struct SCTabsContent<Value: Hashable, Content: View>: View {
  @Environment(\.scTabsRootContext) private var root
  @Environment(\.theme) private var theme

  private let value: Value
  private let keepMounted: Bool
  private let content: Content

  public init(
    value: Value,
    keepMounted: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.value = value
    self.keepMounted = keepMounted
    self.content = content()
  }

  @ViewBuilder
  public var body: some View {
    if isSelected {
      panel
    } else if keepMounted {
      panel
        .hidden()
        .frame(width: 0, height: 0)
        .clipped()
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
  }

  private var panel: some View {
    content
      .foregroundStyle(theme.foreground)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var isSelected: Bool {
    root?.selectedValue == AnyHashable(value)
  }
}

// MARK: - Array convenience

extension SCTabs where Content == AnyView {
  /// Compatibility composition for the original data-driven API.
  public init<PanelContent: View>(
    selection: Binding<Value>,
    variant: SCTabsVariant = .segmented,
    tabs: [SCTabItem<Value>],
    @ViewBuilder content: @escaping (Value) -> PanelContent
  ) {
    self.init(selection: selection, orientation: .horizontal, spacing: 16) {
      AnyView(
        Group {
          SCTabsList(variant: variant) {
            ForEach(tabs) { tab in
              SCTabsTrigger(
                value: tab.value,
                isDisabled: tab.isDisabled,
                accessibilityLabel: tab.label
              ) {
                if let systemImage = tab.systemImage {
                  Label(tab.label, systemImage: systemImage)
                } else {
                  Text(tab.label)
                }
              }
            }
          }
          ForEach(tabs) { tab in
            SCTabsContent(value: tab.value) {
              content(tab.value)
            }
          }
        }
      )
    }
  }
}
