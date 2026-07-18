// ============================================================
// Combobox.swift — swiftcn-ui
// Depends on: Theme/
// ============================================================
import SwiftUI

extension Notification.Name {
  fileprivate static let scComboboxWillPresent = Notification.Name("SCComboboxWillPresent")
}

private struct SCComboboxPresentationExclusivity: ViewModifier {
  @Binding var isPresented: Bool
  let presentationID: UUID

  func body(content: Content) -> some View {
    content.onReceive(NotificationCenter.default.publisher(for: .scComboboxWillPresent)) {
      notification in
      guard
        isPresented,
        let openedID = notification.object as? UUID,
        openedID != presentationID
      else { return }
      isPresented = false
    }
  }
}

// MARK: - Option

/// One entry in an `SCCombobox`: the value it writes to the selection
/// binding and the label shown (and searched) for it.
public struct SCComboboxOption<Value: Hashable>: Identifiable {
  public let value: Value
  public let label: String
  public let keywords: [String]
  public let group: String?
  public let isDisabled: Bool

  public var id: Value { value }

  public init(
    value: Value,
    label: String,
    keywords: [String] = [],
    group: String? = nil,
    isDisabled: Bool = false
  ) {
    self.value = value
    self.label = label
    self.keywords = keywords
    self.group = group
    self.isDisabled = isDisabled
  }

  func matches(_ query: String) -> Bool {
    label.localizedCaseInsensitiveContains(query)
      || keywords.contains { $0.localizedCaseInsensitiveContains(query) }
  }
}

// MARK: - Composable primitives

/// Read-only state exposed to an `SCComboboxRoot` content builder.
public struct SCComboboxSnapshot<Value: Hashable> {
  public let isPresented: Bool
  public let query: String
  public let selectedValues: [Value]
  public let allowsMultipleSelection: Bool
}

/// Selects the value represented by an explicitly interactive combobox row.
public struct SCComboboxSelectionAction {
  private let action: () -> Void

  init(action: @escaping () -> Void) {
    self.action = action
  }

  public func callAsFunction() {
    action()
  }
}

final class SCComboboxKeyboardCoordinator {
  var moveHighlight: (Int) -> Void = { _ in }
  var selectHighlighted: () -> Bool = { false }
}

struct SCComboboxContext {
  var isPresented: Binding<Bool>
  var query: Binding<String>
  var selectedValues: [AnyHashable]
  var allowsMultipleSelection: Bool
  var isDisabled: Bool
  var select: (AnyHashable) -> Void
  var remove: (AnyHashable) -> Void
  var clear: () -> Void
  var keyboard: SCComboboxKeyboardCoordinator
}

private struct SCComboboxContextKey: EnvironmentKey {
  static var defaultValue: SCComboboxContext {
    SCComboboxContext(
      isPresented: .constant(false),
      query: .constant(""),
      selectedValues: [],
      allowsMultipleSelection: false,
      isDisabled: true,
      select: { _ in },
      remove: { _ in },
      clear: {},
      keyboard: SCComboboxKeyboardCoordinator()
    )
  }
}

extension EnvironmentValues {
  var scComboboxContext: SCComboboxContext {
    get { self[SCComboboxContextKey.self] }
    set { self[SCComboboxContextKey.self] = newValue }
  }
}

/// Owns presentation/query state and provides caller-owned selection to all combobox parts.
public struct SCComboboxRoot<Value: Hashable, Content: View>: View {
  @Environment(\.isEnabled) private var isEnabled
  @State private var internalIsPresented: Bool
  @State private var internalQuery: String
  @State private var keyboard = SCComboboxKeyboardCoordinator()
  @State private var presentationID = UUID()

  private enum Selection {
    case single(Binding<Value?>)
    case multiple(Binding<Set<Value>>)
  }

  private let selection: Selection
  private let externalIsPresented: Binding<Bool>?
  private let externalQuery: Binding<String>?
  private let isDisabled: Bool
  private let resetsQueryOnOpen: Bool
  private let onOpenChange: ((Bool) -> Void)?
  private let onQueryChange: ((String) -> Void)?
  private let onValueChange: (([Value]) -> Void)?
  private let itemToStringValue: ((Value) -> String)?
  private let content: (SCComboboxSnapshot<Value>) -> Content

  public init(
    selection: Binding<Value?>,
    isPresented: Binding<Bool>? = nil,
    defaultPresented: Bool = false,
    query: Binding<String>? = nil,
    defaultQuery: String = "",
    isDisabled: Bool = false,
    resetsQueryOnOpen: Bool = false,
    onOpenChange: ((Bool) -> Void)? = nil,
    onQueryChange: ((String) -> Void)? = nil,
    onValueChange: (([Value]) -> Void)? = nil,
    itemToStringValue: ((Value) -> String)? = nil,
    @ViewBuilder content: @escaping (SCComboboxSnapshot<Value>) -> Content
  ) {
    self.selection = .single(selection)
    self.externalIsPresented = isPresented
    self.externalQuery = query
    self._internalIsPresented = State(initialValue: defaultPresented)
    self._internalQuery = State(initialValue: defaultQuery)
    self.isDisabled = isDisabled
    self.resetsQueryOnOpen = resetsQueryOnOpen
    self.onOpenChange = onOpenChange
    self.onQueryChange = onQueryChange
    self.onValueChange = onValueChange
    self.itemToStringValue = itemToStringValue
    self.content = content
  }

  public init(
    selection: Binding<Set<Value>>,
    isPresented: Binding<Bool>? = nil,
    defaultPresented: Bool = false,
    query: Binding<String>? = nil,
    defaultQuery: String = "",
    isDisabled: Bool = false,
    resetsQueryOnOpen: Bool = false,
    onOpenChange: ((Bool) -> Void)? = nil,
    onQueryChange: ((String) -> Void)? = nil,
    onValueChange: (([Value]) -> Void)? = nil,
    itemToStringValue: ((Value) -> String)? = nil,
    @ViewBuilder content: @escaping (SCComboboxSnapshot<Value>) -> Content
  ) {
    self.selection = .multiple(selection)
    self.externalIsPresented = isPresented
    self.externalQuery = query
    self._internalIsPresented = State(initialValue: defaultPresented)
    self._internalQuery = State(initialValue: defaultQuery)
    self.isDisabled = isDisabled
    self.resetsQueryOnOpen = resetsQueryOnOpen
    self.onOpenChange = onOpenChange
    self.onQueryChange = onQueryChange
    self.onValueChange = onValueChange
    self.itemToStringValue = itemToStringValue
    self.content = content
  }

  public var body: some View {
    content(snapshot)
      .environment(
        \.scComboboxContext,
        SCComboboxContext(
          isPresented: presentedBinding,
          query: queryBinding,
          selectedValues: selectedValues.map { AnyHashable($0) },
          allowsMultipleSelection: allowsMultipleSelection,
          isDisabled: isDisabled || !isEnabled,
          select: select,
          remove: remove,
          clear: clear,
          keyboard: keyboard
        )
      )
      .modifier(
        SCComboboxPresentationExclusivity(
          isPresented: presentedBinding,
          presentationID: presentationID
        )
      )
  }

  private var snapshot: SCComboboxSnapshot<Value> {
    SCComboboxSnapshot(
      isPresented: presentedBinding.wrappedValue,
      query: queryBinding.wrappedValue,
      selectedValues: selectedValues,
      allowsMultipleSelection: allowsMultipleSelection
    )
  }

  private var allowsMultipleSelection: Bool {
    if case .multiple = selection { return true }
    return false
  }

  private var selectedValues: [Value] {
    switch selection {
    case .single(let binding): binding.wrappedValue.map { [$0] } ?? []
    case .multiple(let binding): Array(binding.wrappedValue)
    }
  }

  private var presentedBinding: Binding<Bool> {
    Binding(
      get: { externalIsPresented?.wrappedValue ?? internalIsPresented },
      set: { newValue in
        guard newValue != (externalIsPresented?.wrappedValue ?? internalIsPresented) else {
          return
        }
        if newValue {
          NotificationCenter.default.post(
            name: .scComboboxWillPresent,
            object: presentationID
          )
        }
        if let externalIsPresented {
          externalIsPresented.wrappedValue = newValue
        } else {
          internalIsPresented = newValue
        }
        if newValue, resetsQueryOnOpen, externalQuery == nil {
          internalQuery = ""
        }
        onOpenChange?(newValue)
      }
    )
  }

  private var queryBinding: Binding<String> {
    Binding(
      get: { externalQuery?.wrappedValue ?? internalQuery },
      set: { newValue in
        if let externalQuery {
          externalQuery.wrappedValue = newValue
        } else {
          internalQuery = newValue
        }
        onQueryChange?(newValue)
      }
    )
  }

  private func select(_ erasedValue: AnyHashable) {
    guard !isDisabled, let value = erasedValue.base as? Value else { return }
    switch selection {
    case .single(let binding):
      binding.wrappedValue = value
      if let itemToStringValue {
        queryBinding.wrappedValue = itemToStringValue(value)
      }
      presentedBinding.wrappedValue = false
    case .multiple(let binding):
      if binding.wrappedValue.contains(value) {
        binding.wrappedValue.remove(value)
      } else {
        binding.wrappedValue.insert(value)
      }
      queryBinding.wrappedValue = ""
    }
    onValueChange?(selectedValues)
  }

  private func remove(_ erasedValue: AnyHashable) {
    guard !isDisabled, let value = erasedValue.base as? Value else { return }
    switch selection {
    case .single(let binding):
      if binding.wrappedValue == value { binding.wrappedValue = nil }
    case .multiple(let binding):
      binding.wrappedValue.remove(value)
    }
    onValueChange?(selectedValues)
  }

  private func clear() {
    guard !isDisabled else { return }
    switch selection {
    case .single(let binding): binding.wrappedValue = nil
    case .multiple(let binding): binding.wrappedValue.removeAll()
    }
    onValueChange?([])
  }
}
