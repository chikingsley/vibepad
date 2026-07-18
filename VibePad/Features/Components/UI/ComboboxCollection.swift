import SwiftUI

private struct SCComboboxFilteredSection<Value: Hashable>: Identifiable {
  let id: String
  let title: String?
  let items: [SCComboboxOption<Value>]
}

private struct SCComboboxRowSelectionModifier<Value: Hashable>: ViewModifier {
  let option: SCComboboxOption<Value>
  let context: SCComboboxContext
  let selectsOnRowTap: Bool

  @ViewBuilder
  func body(content: Content) -> some View {
    if selectsOnRowTap {
      content
        .onTapGesture {
          guard !context.isDisabled, !option.isDisabled else { return }
          context.select(AnyHashable(option.value))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(option.label)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction {
          guard !context.isDisabled, !option.isDisabled else { return }
          context.select(AnyHashable(option.value))
        }
    } else {
      content
    }
  }
}

public struct SCComboboxCollection<
  Value: Hashable,
  Row: View,
  GroupHeader: View,
  Empty: View
>: View {
  @Environment(\.scComboboxContext) private var context
  @Environment(\.theme) private var theme
  @State private var highlightedValue: Value?
  @FocusState private var isCollectionFocused: Bool

  private let options: [SCComboboxOption<Value>]
  private let customFilter: ((SCComboboxOption<Value>, String) -> Bool)?
  private let autoHighlight: Bool
  private let focusesSelectionOnAppear: Bool
  private let selectsOnRowTap: Bool
  private let row: (SCComboboxOption<Value>, Bool, Bool, SCComboboxSelectionAction) -> Row
  private let groupHeader: (String) -> GroupHeader
  private let empty: () -> Empty

  public init(
    options: [SCComboboxOption<Value>],
    autoHighlight: Bool = true,
    focusesSelectionOnAppear: Bool = false,
    selectsOnRowTap: Bool = true,
    filter: ((SCComboboxOption<Value>, String) -> Bool)? = nil,
    @ViewBuilder row:
      @escaping (
        _ option: SCComboboxOption<Value>,
        _ isSelected: Bool,
        _ isHighlighted: Bool,
        _ select: SCComboboxSelectionAction
      ) -> Row,
    @ViewBuilder groupHeader: @escaping (String) -> GroupHeader,
    @ViewBuilder empty: @escaping () -> Empty
  ) {
    self.options = options
    self.autoHighlight = autoHighlight
    self.focusesSelectionOnAppear = focusesSelectionOnAppear
    self.selectsOnRowTap = selectsOnRowTap
    self.customFilter = filter
    self.row = row
    self.groupHeader = groupHeader
    self.empty = empty
  }

  public var body: some View {
    Group {
      if filteredSections.isEmpty {
        SCComboboxEmpty { empty() }
      } else {
        ScrollViewReader { proxy in
          ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
              ForEach(
                Array(filteredSections.enumerated()),
                id: \.element.id
              ) { sectionIndex, section in
                if let title = section.title {
                  SCComboboxLabel { groupHeader(title) }
                }
                ForEach(section.items) { option in
                  optionRow(option).id(option.value)
                }
                if sectionIndex < filteredSections.count - 1 {
                  SCComboboxSeparator()
                }
              }
            }
            .padding(6)
          }
          .id(context.query.wrappedValue)
          .onChange(of: highlightedValue) { _, value in
            if let value { proxy.scrollTo(value) }
          }
        }
      }
    }
    .focusable(focusesSelectionOnAppear)
    .focused($isCollectionFocused)
    .focusEffectDisabled()
    .onKeyPress(.upArrow) {
      moveHighlight(by: -1)
      return .handled
    }
    .onKeyPress(.downArrow) {
      moveHighlight(by: 1)
      return .handled
    }
    .onKeyPress(.return) {
      selectHighlighted() ? .handled : .ignored
    }
    .onKeyPress(.escape) {
      context.isPresented.wrappedValue = false
      return .handled
    }
    .onAppear(perform: installKeyboardHandlers)
    .onDisappear {
      context.keyboard.moveHighlight = { _ in }
      context.keyboard.selectHighlighted = { false }
    }
    .onChange(of: context.query.wrappedValue) { _, _ in resetHighlight() }
    .onChange(of: filteredOptions.map(\.value)) { _, _ in resetHighlight() }
  }

  private func optionRow(_ option: SCComboboxOption<Value>) -> some View {
    let isSelected = context.selectedValues.contains(AnyHashable(option.value))
    let isHighlighted = highlightedValue == option.value
    let selectionAction = SCComboboxSelectionAction {
      context.select(AnyHashable(option.value))
    }
    return row(option, isSelected, isHighlighted, selectionAction)
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(rowShape)
      .background(isHighlighted ? theme.accent : .clear, in: rowShape)
      .foregroundStyle(
        isHighlighted ? theme.accentForeground : theme.popoverForeground
      )
      .modifier(
        SCComboboxRowSelectionModifier(
          option: option,
          context: context,
          selectsOnRowTap: selectsOnRowTap
        )
      )
      .focusable(
        !focusesSelectionOnAppear && !context.isDisabled && !option.isDisabled
      )
      .focusEffectDisabled()
      .onKeyPress(.return) {
        guard !context.isDisabled, !option.isDisabled else { return .ignored }
        context.select(AnyHashable(option.value))
        return .handled
      }
      .disabled(context.isDisabled || option.isDisabled)
      .opacity(option.isDisabled ? 0.5 : 1)
      .onHover { hovering in
        if hovering, !option.isDisabled { highlightedValue = option.value }
      }
      .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private var filteredOptions: [SCComboboxOption<Value>] {
    let query = context.query.wrappedValue.trimmingCharacters(in: .whitespaces)
    guard !query.isEmpty else { return options }
    return options.filter { customFilter?($0, query) ?? $0.matches(query) }
  }

  private var selectableOptions: [SCComboboxOption<Value>] {
    filteredOptions.filter { !$0.isDisabled }
  }

  private var filteredSections: [SCComboboxFilteredSection<Value>] {
    var order: [String] = []
    var grouped: [String: [SCComboboxOption<Value>]] = [:]
    for option in filteredOptions {
      let key = option.group ?? ""
      if grouped[key] == nil { order.append(key) }
      grouped[key, default: []].append(option)
    }
    return order.map { key in
      SCComboboxFilteredSection(
        id: key.isEmpty ? "ungrouped" : key,
        title: key.isEmpty ? nil : key,
        items: grouped[key, default: []]
      )
    }
  }

  private var rowShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: max(theme.radius - 4, 2), style: .continuous)
  }

  private func installKeyboardHandlers() {
    resetHighlight()
    if focusesSelectionOnAppear {
      DispatchQueue.main.async { isCollectionFocused = true }
    }
    context.keyboard.moveHighlight = moveHighlight
    context.keyboard.selectHighlighted = selectHighlighted
  }

  private func resetHighlight() {
    guard autoHighlight else {
      highlightedValue = nil
      return
    }

    highlightedValue =
      selectableOptions.first {
        context.selectedValues.contains(AnyHashable($0.value))
      }?.value ?? selectableOptions.first?.value
  }

  private func moveHighlight(by offset: Int) {
    let values = selectableOptions.map(\.value)
    guard !values.isEmpty else { return }
    guard
      let highlightedValue,
      let index = values.firstIndex(of: highlightedValue)
    else {
      self.highlightedValue = offset > 0 ? values.first : values.last
      return
    }
    self.highlightedValue = values[(index + offset + values.count) % values.count]
  }

  private func selectHighlighted() -> Bool {
    guard let highlightedValue else { return false }
    context.select(AnyHashable(highlightedValue))
    return true
  }
}

/// A centered empty-results slot.
public struct SCComboboxEmpty<Content: View>: View {
  @Environment(\.theme) private var theme
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.footnote)
      .foregroundStyle(theme.mutedForeground)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 20)
  }
}

/// A semantic divider between combobox groups.
public struct SCComboboxSeparator: View {
  @Environment(\.theme) private var theme

  public init() {}

  public var body: some View {
    Rectangle()
      .fill(theme.border)
      .frame(height: 1)
      .padding(.vertical, 4)
      .accessibilityHidden(true)
  }
}

/// A wrapping container for selected-value chips and a chips input.
public struct SCComboboxChips<Content: View>: View {
  @Environment(\.scComboboxContext) private var context
  @Environment(\.theme) private var theme
  private let content: Content
  private let isInvalid: Bool

  public init(
    isInvalid: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.isInvalid = isInvalid
    self.content = content()
  }

  public var body: some View {
    SCComboboxFlowLayout(spacing: 6) { content }
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .frame(minHeight: 36)
      .background(theme.background, in: shape)
      .overlay { shape.strokeBorder(isInvalid ? theme.destructive : theme.input) }
      .opacity(context.isDisabled ? 0.5 : 1)
      .accessibilityHint(isInvalid ? "Invalid selection" : "")
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
  }
}

/// One selected value with an optional real removal action.
public struct SCComboboxChip<Value: Hashable, Content: View>: View {
  @Environment(\.scComboboxContext) private var context
  @Environment(\.theme) private var theme
  private let value: Value
  private let showsRemove: Bool
  private let isDisabled: Bool
  private let content: Content

  public init(
    value: Value,
    showsRemove: Bool = true,
    isDisabled: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.value = value
    self.showsRemove = showsRemove
    self.isDisabled = isDisabled
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: 4) {
      content
      if showsRemove {
        Button {
          context.remove(AnyHashable(value))
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 8, weight: .bold))
            .frame(width: 16, height: 16)
        }
        .buttonStyle(.plain)
        .disabled(context.isDisabled || isDisabled)
        .accessibilityLabel("Remove")
      }
    }
    .font(.caption.weight(.medium))
    .padding(.leading, 7)
    .padding(.trailing, showsRemove ? 2 : 7)
    .frame(height: 24)
    .background(theme.muted, in: RoundedRectangle(cornerRadius: 4))
    .opacity(isDisabled ? 0.5 : 1)
  }
}

/// A borderless query field intended for placement inside `SCComboboxChips`.
public struct SCComboboxChipsInput: View {
  @Environment(\.scComboboxContext) private var context
  @Environment(\.theme) private var theme
  @FocusState private var isFocused: Bool
  private let placeholder: String

  public init(placeholder: String = "") {
    self.placeholder = placeholder
  }

  public var body: some View {
    TextField(placeholder, text: context.query)
      .textFieldStyle(.plain)
      .font(.subheadline)
      .foregroundStyle(theme.foreground)
      .focused($isFocused)
      .frame(minWidth: 64)
      .onKeyPress(.upArrow) {
        context.keyboard.moveHighlight(-1)
        return .handled
      }
      .onKeyPress(.downArrow) {
        context.keyboard.moveHighlight(1)
        return .handled
      }
      .onKeyPress(.return) {
        context.keyboard.selectHighlighted() ? .handled : .ignored
      }
      .onKeyPress(.escape) {
        context.isPresented.wrappedValue = false
        return .handled
      }
      .onSubmit { _ = context.keyboard.selectHighlighted() }
      .disabled(context.isDisabled)
      .onChange(of: isFocused) { _, focused in
        if focused { context.isPresented.wrappedValue = true }
      }
  }
}
