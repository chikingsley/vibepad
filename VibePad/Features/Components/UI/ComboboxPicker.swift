import SwiftUI

// MARK: - Component

/// A searchable select convenience composed from the same primitives as
/// `SCComboboxRoot`.
///
/// A field-styled trigger opens an anchored popover with a search field and
/// the filtered option list. The selected option shows a leading checkmark;
/// ↑/↓ move the highlight and Return picks it. Choosing an option writes the
/// binding and closes the popover.
///
///     SCCombobox(selection: $framework,
///                options: ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"])
///
///     SCCombobox(selection: $timezone, options: [
///         SCComboboxOption(value: TimeZone(identifier: "GMT")!, label: "GMT"),
///         SCComboboxOption(value: TimeZone(identifier: "EST")!, label: "Eastern"),
///     ])
public struct SCCombobox<Value: Hashable>: View {
  @Environment(\.theme) private var theme
  @State private var isPresented = false

  private enum Selection {
    case single(Binding<Value?>)
    case multiple(Binding<Set<Value>>)
  }

  private let selection: Selection
  private let options: [SCComboboxOption<Value>]
  private let placeholder: String
  private let searchPlaceholder: String
  private let externalQuery: Binding<String>?
  private let showsClearButton: Bool
  private let showsSearchField: Bool
  private let contentWidth: CGFloat
  private let contentMaxHeight: CGFloat
  private let estimatedRowHeight: CGFloat
  private let customFilter: ((SCComboboxOption<Value>, String) -> Bool)?
  private let customTrigger: (([SCComboboxOption<Value>], Bool) -> AnyView)?
  private let customRow: ((SCComboboxOption<Value>, Bool, SCComboboxSelectionAction) -> AnyView)?
  private let customRowsSelectOnTap: Bool
  private let customGroupHeader: ((String) -> AnyView)?
  private let customEmpty: (() -> AnyView)?

  /// Creates a combobox over typed options.
  /// - Parameters:
  ///   - selection: The chosen value; `nil` shows the placeholder.
  ///   - options: The values to choose from, with their labels.
  ///   - placeholder: Trigger text while nothing is selected.
  ///   - searchPlaceholder: Prompt shown in the popover's search field.
  public init(
    selection: Binding<Value?>,
    options: [SCComboboxOption<Value>],
    placeholder: String = "Select…",
    searchPlaceholder: String = "Search…",
    query: Binding<String>? = nil,
    showsClearButton: Bool = false,
    showsSearchField: Bool = true,
    contentWidth: CGFloat = 240,
    contentMaxHeight: CGFloat = 320,
    estimatedRowHeight: CGFloat = 36,
    filter: ((SCComboboxOption<Value>, String) -> Bool)? = nil
  ) {
    self.selection = .single(selection)
    self.options = options
    self.placeholder = placeholder
    self.searchPlaceholder = searchPlaceholder
    self.externalQuery = query
    self.showsClearButton = showsClearButton
    self.showsSearchField = showsSearchField
    self.contentWidth = contentWidth
    self.contentMaxHeight = contentMaxHeight
    self.estimatedRowHeight = estimatedRowHeight
    self.customFilter = filter
    self.customTrigger = nil
    self.customRow = nil
    self.customRowsSelectOnTap = true
    self.customGroupHeader = nil
    self.customEmpty = nil
  }

  /// Creates a multi-select combobox. Choosing an item toggles membership
  /// and keeps the popover open for the next selection.
  public init(
    selection: Binding<Set<Value>>,
    options: [SCComboboxOption<Value>],
    placeholder: String = "Select…",
    searchPlaceholder: String = "Search…",
    query: Binding<String>? = nil,
    showsClearButton: Bool = true,
    showsSearchField: Bool = true,
    contentWidth: CGFloat = 240,
    contentMaxHeight: CGFloat = 320,
    estimatedRowHeight: CGFloat = 36,
    filter: ((SCComboboxOption<Value>, String) -> Bool)? = nil
  ) {
    self.selection = .multiple(selection)
    self.options = options
    self.placeholder = placeholder
    self.searchPlaceholder = searchPlaceholder
    self.externalQuery = query
    self.showsClearButton = showsClearButton
    self.showsSearchField = showsSearchField
    self.contentWidth = contentWidth
    self.contentMaxHeight = contentMaxHeight
    self.estimatedRowHeight = estimatedRowHeight
    self.customFilter = filter
    self.customTrigger = nil
    self.customRow = nil
    self.customRowsSelectOnTap = true
    self.customGroupHeader = nil
    self.customEmpty = nil
  }

  /// Creates a single-select combobox with custom trigger, row, group, and
  /// empty-state content. The row builder receives its selected state.
  public init<Trigger: View, Row: View, GroupHeader: View, Empty: View>(
    selection: Binding<Value?>,
    options: [SCComboboxOption<Value>],
    placeholder: String = "Select…",
    searchPlaceholder: String = "Search…",
    query: Binding<String>? = nil,
    showsClearButton: Bool = false,
    showsSearchField: Bool = true,
    contentWidth: CGFloat = 240,
    contentMaxHeight: CGFloat = 320,
    estimatedRowHeight: CGFloat = 36,
    filter: ((SCComboboxOption<Value>, String) -> Bool)? = nil,
    selectsOnRowTap: Bool = true,
    @ViewBuilder trigger:
      @escaping (_ selected: [SCComboboxOption<Value>], _ expanded: Bool) -> Trigger,
    @ViewBuilder row:
      @escaping (
        _ option: SCComboboxOption<Value>,
        _ selected: Bool,
        _ select: SCComboboxSelectionAction
      ) -> Row,
    @ViewBuilder groupHeader: @escaping (String) -> GroupHeader,
    @ViewBuilder empty: @escaping () -> Empty
  ) {
    self.selection = .single(selection)
    self.options = options
    self.placeholder = placeholder
    self.searchPlaceholder = searchPlaceholder
    self.externalQuery = query
    self.showsClearButton = showsClearButton
    self.showsSearchField = showsSearchField
    self.contentWidth = contentWidth
    self.contentMaxHeight = contentMaxHeight
    self.estimatedRowHeight = estimatedRowHeight
    self.customFilter = filter
    self.customTrigger = { AnyView(trigger($0, $1)) }
    self.customRow = { AnyView(row($0, $1, $2)) }
    self.customRowsSelectOnTap = selectsOnRowTap
    self.customGroupHeader = { AnyView(groupHeader($0)) }
    self.customEmpty = { AnyView(empty()) }
  }

  /// Creates a multi-select combobox with fully custom content.
  public init<Trigger: View, Row: View, GroupHeader: View, Empty: View>(
    selection: Binding<Set<Value>>,
    options: [SCComboboxOption<Value>],
    placeholder: String = "Select…",
    searchPlaceholder: String = "Search…",
    query: Binding<String>? = nil,
    showsClearButton: Bool = true,
    showsSearchField: Bool = true,
    contentWidth: CGFloat = 240,
    contentMaxHeight: CGFloat = 320,
    estimatedRowHeight: CGFloat = 36,
    filter: ((SCComboboxOption<Value>, String) -> Bool)? = nil,
    @ViewBuilder trigger:
      @escaping (_ selected: [SCComboboxOption<Value>], _ expanded: Bool) -> Trigger,
    @ViewBuilder row: @escaping (_ option: SCComboboxOption<Value>, _ selected: Bool) -> Row,
    @ViewBuilder groupHeader: @escaping (String) -> GroupHeader,
    @ViewBuilder empty: @escaping () -> Empty
  ) {
    self.selection = .multiple(selection)
    self.options = options
    self.placeholder = placeholder
    self.searchPlaceholder = searchPlaceholder
    self.externalQuery = query
    self.showsClearButton = showsClearButton
    self.showsSearchField = showsSearchField
    self.contentWidth = contentWidth
    self.contentMaxHeight = contentMaxHeight
    self.estimatedRowHeight = estimatedRowHeight
    self.customFilter = filter
    self.customTrigger = { AnyView(trigger($0, $1)) }
    self.customRow = { option, selected, _ in AnyView(row(option, selected)) }
    self.customRowsSelectOnTap = true
    self.customGroupHeader = { AnyView(groupHeader($0)) }
    self.customEmpty = { AnyView(empty()) }
  }

  @ViewBuilder
  public var body: some View {
    switch selection {
    case .single(let binding):
      SCComboboxRoot(
        selection: binding,
        isPresented: $isPresented,
        query: externalQuery,
        resetsQueryOnOpen: true
      ) { snapshot in
        composition(snapshot)
      }
    case .multiple(let binding):
      SCComboboxRoot(
        selection: binding,
        isPresented: $isPresented,
        query: externalQuery,
        resetsQueryOnOpen: true
      ) { snapshot in
        composition(snapshot)
      }
    }
  }

  private func composition(_ snapshot: SCComboboxSnapshot<Value>) -> some View {
    let selected = selectedOptions(for: snapshot.selectedValues)
    return HStack(spacing: 4) {
      SCComboboxTrigger(showsIndicator: false) { expanded in
        triggerContent(selected: selected, expanded: expanded)
      }
      .buttonStyle(.plain)
      .accessibilityValue(selectionDescription(for: selected))
      .accessibilityHint(
        snapshot.isPresented ? "Closes options" : "Opens searchable options"
      )

      if showsClearButton, !selected.isEmpty {
        SCComboboxClear {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(theme.mutedForeground)
            .frame(width: 28, height: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
    .background {
      SCComboboxContent(
        width: contentWidth,
        maxHeight: contentMaxHeight,
        alignment: .end
      ) {
        menuContent(query: snapshot.query)
      }
    }
  }

  @ViewBuilder
  private func triggerContent(
    selected: [SCComboboxOption<Value>],
    expanded: Bool
  ) -> some View {
    if let customTrigger {
      customTrigger(selected, expanded)
    } else {
      HStack(spacing: 8) {
        Text(selectionDescription(for: selected))
          .font(.subheadline)
          .foregroundStyle(selected.isEmpty ? theme.mutedForeground : theme.foreground)
          .lineLimit(1)
        Spacer(minLength: 8)
        Image(systemName: "chevron.down")
          .font(.caption)
          .foregroundStyle(theme.mutedForeground)
          .rotationEffect(.degrees(expanded ? 180 : 0))
          .accessibilityHidden(true)
      }
      .padding(.horizontal, 12)
      .frame(height: 40)
      .frame(maxWidth: .infinity)
      .background(theme.background, in: triggerShape)
      .overlay(triggerShape.strokeBorder(theme.input))
      .contentShape(triggerShape)
    }
  }

  private var triggerShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
  }

  private var collection: some View {
    SCComboboxCollection(
      options: options,
      focusesSelectionOnAppear: !showsSearchField,
      selectsOnRowTap: customRowsSelectOnTap,
      filter: customFilter,
      row: { option, isSelected, _, select in
        rowContent(option: option, isSelected: isSelected, select: select)
      },
      groupHeader: { title in groupHeaderContent(title) },
      empty: { emptyContent }
    )
    .frame(width: contentWidth)
    .frame(maxHeight: max(contentMaxHeight - (showsSearchField ? 49 : 0), 80))
    .foregroundStyle(theme.popoverForeground)
  }

  @ViewBuilder
  private func rowContent(
    option: SCComboboxOption<Value>,
    isSelected: Bool,
    select: SCComboboxSelectionAction
  ) -> some View {
    if let customRow {
      customRow(option, isSelected, select)
    } else {
      HStack(spacing: 8) {
        Image(systemName: "checkmark")
          .font(.caption.weight(.semibold))
          .opacity(isSelected ? 1 : 0)
          .accessibilityHidden(true)
        Text(option.label)
          .font(.subheadline)
          .lineLimit(1)
        Spacer(minLength: 8)
      }
    }
  }

  @ViewBuilder
  private func groupHeaderContent(_ title: String) -> some View {
    if let customGroupHeader {
      customGroupHeader(title)
    } else {
      Text(title)
    }
  }

  @ViewBuilder
  private var emptyContent: some View {
    if let customEmpty {
      customEmpty()
    } else {
      Text("No results.")
    }
  }

}

extension SCCombobox {
  private func selectedOptions(for values: [Value]) -> [SCComboboxOption<Value>] {
    let selected = Set(values)
    return options.filter { selected.contains($0.value) }
  }

  private func selectionDescription(
    for selected: [SCComboboxOption<Value>]
  ) -> String {
    guard !selected.isEmpty else { return placeholder }
    if selected.count <= 2 {
      return selected.map(\.label).joined(separator: ", ")
    }
    return "\(selected.count) selected"
  }

  fileprivate func menuContent(query: String) -> some View {
    VStack(spacing: 0) {
      if showsSearchField {
        SCComboboxInput(
          placeholder: searchPlaceholder,
          showsTrigger: false,
          autoFocus: true,
          isEmbedded: true
        )
        .padding(.horizontal, 6)
        .padding(.top, 4)
      }
      collection
        .frame(height: collectionHeight(query: query))
    }
    .frame(width: contentWidth)
    .foregroundStyle(theme.popoverForeground)
    .background { menuShape.fill(theme.popover) }
    .overlay(menuShape.strokeBorder(theme.border))
    .environment(\.theme, theme)
  }

  fileprivate var menuShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius + 2, style: .continuous)
  }

  fileprivate func collectionHeight(query: String) -> CGFloat {
    let query = query.trimmingCharacters(in: .whitespaces)
    let filtered =
      query.isEmpty
      ? options
      : options.filter { customFilter?($0, query) ?? $0.matches(query) }
    let groupCount = Set(filtered.compactMap(\.group)).count
    let intrinsicHeight =
      CGFloat(filtered.count) * max(estimatedRowHeight, 1)
      + CGFloat(groupCount * 29 + 12)
    let availableHeight = max(contentMaxHeight - (showsSearchField ? 49 : 0), 80)
    return min(max(intrinsicHeight, 52), availableHeight)
  }

}
