// ============================================================
// Command.swift — swiftcn-ui
// Depends on: Theme/, Kbd.swift (SCKbd)
// ============================================================
import SwiftUI

// MARK: - Model

/// One executable entry in a command list: a title, optional icon and
/// shortcut hint, extra search keywords, and the action to run.
public struct SCCommandItem: Identifiable, Sendable {
  public let id: String
  public let title: String
  public let systemImage: String?
  public let shortcut: String?
  public let keywords: [String]
  public let action: @Sendable () -> Void

  /// Creates a command item.
  /// - Parameters:
  ///   - id: Stable identity; defaults to `title`. Provide one when two
  ///     items share a title.
  ///   - title: The visible label, also matched by the search filter.
  ///   - systemImage: Optional leading SF Symbol.
  ///   - shortcut: Optional shortcut hint rendered as a keycap (e.g. "⌘P").
  ///   - keywords: Extra terms the search filter matches besides the title.
  ///   - action: Runs when the item is chosen.
  public init(
    id: String? = nil,
    title: String,
    systemImage: String? = nil,
    shortcut: String? = nil,
    keywords: [String] = [],
    action: @escaping @Sendable () -> Void
  ) {
    self.id = id ?? title
    self.title = title
    self.systemImage = systemImage
    self.shortcut = shortcut
    self.keywords = keywords
    self.action = action
  }

  /// Case-insensitive substring match over the title and keywords.
  func matches(_ query: String) -> Bool {
    title.localizedCaseInsensitiveContains(query)
      || keywords.contains { $0.localizedCaseInsensitiveContains(query) }
  }
}

/// A labeled section of command items.
public struct SCCommandGroup: Identifiable, Sendable {
  public let label: String
  public let items: [SCCommandItem]

  public var id: String { label }

  public init(label: String, items: [SCCommandItem]) {
    self.label = label
    self.items = items
  }
}

/// A section of arbitrary values displayed by `SCCommandCollection`.
public struct SCCommandSection<Item>: Identifiable {
  public let id: String
  public let title: String?
  public let items: [Item]

  public init(id: String, title: String? = nil, items: [Item]) {
    self.id = id
    self.title = title
    self.items = items
  }
}

private final class SCCommandKeyboardCoordinator {
  var moveHighlight: (Int) -> Void = { _ in }
  var selectHighlighted: () -> Bool = { false }
}

private struct SCCommandContext {
  var query: Binding<String>
  var isDisabled: Bool
  var keyboard: SCCommandKeyboardCoordinator
}

private struct SCCommandContextKey: EnvironmentKey {
  static var defaultValue: SCCommandContext {
    SCCommandContext(
      query: .constant(""),
      isDisabled: true,
      keyboard: SCCommandKeyboardCoordinator()
    )
  }
}

extension EnvironmentValues {
  fileprivate var scCommandContext: SCCommandContext {
    get { self[SCCommandContextKey.self] }
    set { self[SCCommandContextKey.self] = newValue }
  }
}

/// Provides controlled or uncontrolled query state to independently composed command parts.
public struct SCCommandRoot<Content: View>: View {
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.theme) private var theme
  @State private var internalQuery: String
  @State private var keyboard = SCCommandKeyboardCoordinator()

  private let externalQuery: Binding<String>?
  private let isDisabled: Bool
  private let onQueryChange: ((String) -> Void)?
  private let content: (String) -> Content

  public init(
    query: Binding<String>? = nil,
    defaultQuery: String = "",
    isDisabled: Bool = false,
    onQueryChange: ((String) -> Void)? = nil,
    @ViewBuilder content: @escaping (String) -> Content
  ) {
    self.externalQuery = query
    self._internalQuery = State(initialValue: defaultQuery)
    self.isDisabled = isDisabled
    self.onQueryChange = onQueryChange
    self.content = content
  }

  public init(
    query: Binding<String>? = nil,
    defaultQuery: String = "",
    isDisabled: Bool = false,
    onQueryChange: ((String) -> Void)? = nil,
    @ViewBuilder content: @escaping () -> Content
  ) {
    self.init(
      query: query,
      defaultQuery: defaultQuery,
      isDisabled: isDisabled,
      onQueryChange: onQueryChange
    ) { _ in
      content()
    }
  }

  public var body: some View {
    content(queryBinding.wrappedValue)
      .environment(
        \.scCommandContext,
        SCCommandContext(
          query: queryBinding,
          isDisabled: isDisabled || !isEnabled,
          keyboard: keyboard
        )
      )
      .foregroundStyle(theme.popoverForeground)
      .background(theme.popover, in: shape)
      .clipShape(shape)
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

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
  }
}

/// The searchable command input connected to the nearest command root.
public struct SCCommandInput: View {
  @Environment(\.scCommandContext) private var context
  @Environment(\.theme) private var theme
  @FocusState private var isFocused: Bool

  private let placeholder: String
  private let autoFocus: Bool

  public init(
    placeholder: String = "Type a command or search…",
    autoFocus: Bool = true
  ) {
    self.placeholder = placeholder
    self.autoFocus = autoFocus
  }

  public var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .font(.subheadline)
        .foregroundStyle(theme.mutedForeground)
        .accessibilityHidden(true)
      TextField(
        placeholder,
        text: context.query,
        prompt: Text(placeholder).foregroundStyle(theme.mutedForeground)
      )
      .textFieldStyle(.plain)
      .font(.subheadline)
      .foregroundStyle(theme.foreground)
      .focused($isFocused)
      .autocorrectionDisabled()
      #if os(iOS)
        .textInputAutocapitalization(.never)
      #endif
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
      .onSubmit { _ = context.keyboard.selectHighlighted() }
    }
    .padding(.horizontal, 12)
    .frame(height: 44)
    .opacity(context.isDisabled ? 0.5 : 1)
    .disabled(context.isDisabled)
    .onAppear {
      guard autoFocus else { return }
      DispatchQueue.main.async { isFocused = true }
    }
  }
}

/// The scrollable command-list region.
public struct SCCommandResults<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) { content }
        .padding(6)
    }
    .frame(maxHeight: 300)
  }
}

/// Arbitrary empty-results content with command styling.
public struct SCCommandEmpty<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.subheadline)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 24)
  }
}

/// A command group with an optional arbitrary heading.
public struct SCCommandGroupView<Heading: View, Content: View>: View {
  @Environment(\.theme) private var theme
  private let heading: Heading
  private let content: Content

  public init(
    @ViewBuilder heading: () -> Heading,
    @ViewBuilder content: () -> Content
  ) {
    self.heading = heading()
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      heading
        .font(.caption.weight(.medium))
        .foregroundStyle(theme.mutedForeground)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
      content
    }
  }
}

/// A command item with arbitrary content and a real action.
public struct SCCommandItemView<Content: View>: View {
  @Environment(\.scCommandContext) private var context
  @Environment(\.theme) private var theme
  private let isDisabled: Bool
  private let isChecked: Bool
  private let action: () -> Void
  private let content: Content

  public init(
    isDisabled: Bool = false,
    isChecked: Bool = false,
    action: @escaping () -> Void,
    @ViewBuilder content: () -> Content
  ) {
    self.isDisabled = isDisabled
    self.isChecked = isChecked
    self.action = action
    self.content = content()
  }

  public var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        content
        if isChecked {
          Spacer(minLength: 8)
          Image(systemName: "checkmark").accessibilityHidden(true)
        }
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(shape)
    }
    .buttonStyle(.plain)
    .disabled(context.isDisabled || isDisabled)
    .opacity(isDisabled ? 0.5 : 1)
    .accessibilityAddTraits(isChecked ? .isSelected : [])
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: max(theme.radius - 4, 2), style: .continuous)
  }
}

/// A trailing keyboard-shortcut slot.
public struct SCCommandShortcut<Content: View>: View {
  @Environment(\.theme) private var theme
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.caption)
      .tracking(1.5)
      .foregroundStyle(theme.mutedForeground)
      .frame(maxWidth: .infinity, alignment: .trailing)
  }
}

/// A semantic divider between command groups.
public struct SCCommandSeparator: View {
  @Environment(\.theme) private var theme

  public init() {}

  public var body: some View {
    Rectangle()
      .fill(theme.border)
      .frame(height: 1)
      .accessibilityHidden(true)
  }
}

/// The single filtering, highlighting, keyboard, and selection engine for command data.
public struct SCCommandDataCollection<Item>: View {
  @Environment(\.scCommandContext) private var context
  @Environment(\.theme) private var theme
  @State private var highlightedID: AnyHashable?

  private let sections: [SCCommandSection<Item>]
  private let autoHighlight: Bool
  private let itemID: (Item) -> AnyHashable
  private let itemText: (Item) -> String
  private let filter: (Item, String) -> Bool
  private let itemIsEnabled: (Item) -> Bool
  private let onSelect: (Item) -> Void
  private let rowContent: (Item, Bool) -> AnyView
  private let sectionHeader: (SCCommandSection<Item>) -> AnyView
  private let emptyContent: () -> AnyView

  public init<ID: Hashable, Row: View, Header: View, Empty: View>(
    sections: [SCCommandSection<Item>],
    id: KeyPath<Item, ID>,
    autoHighlight: Bool = true,
    itemText: @escaping (Item) -> String,
    filter: ((Item, String) -> Bool)? = nil,
    isItemEnabled: @escaping (Item) -> Bool = { _ in true },
    onSelect: @escaping (Item) -> Void,
    @ViewBuilder row: @escaping (_ item: Item, _ highlighted: Bool) -> Row,
    @ViewBuilder sectionHeader: @escaping (SCCommandSection<Item>) -> Header,
    @ViewBuilder empty: @escaping () -> Empty
  ) {
    self.init(
      sections: sections,
      id: { AnyHashable($0[keyPath: id]) },
      autoHighlight: autoHighlight,
      itemText: itemText,
      filter: filter,
      isItemEnabled: isItemEnabled,
      onSelect: onSelect,
      row: row,
      sectionHeader: sectionHeader,
      empty: empty
    )
  }

  public init<Row: View, Header: View, Empty: View>(
    sections: [SCCommandSection<Item>],
    id: @escaping (Item) -> AnyHashable,
    autoHighlight: Bool = true,
    itemText: @escaping (Item) -> String,
    filter: ((Item, String) -> Bool)? = nil,
    isItemEnabled: @escaping (Item) -> Bool = { _ in true },
    onSelect: @escaping (Item) -> Void,
    @ViewBuilder row: @escaping (_ item: Item, _ highlighted: Bool) -> Row,
    @ViewBuilder sectionHeader: @escaping (SCCommandSection<Item>) -> Header,
    @ViewBuilder empty: @escaping () -> Empty
  ) {
    self.sections = sections
    self.autoHighlight = autoHighlight
    self.itemID = id
    self.itemText = itemText
    self.filter =
      filter ?? { item, query in
        itemText(item).localizedCaseInsensitiveContains(query)
      }
    self.itemIsEnabled = isItemEnabled
    self.onSelect = onSelect
    self.rowContent = { AnyView(row($0, $1)) }
    self.sectionHeader = { AnyView(sectionHeader($0)) }
    self.emptyContent = { AnyView(empty()) }
  }

  public var body: some View {
    Group {
      if filteredSections.isEmpty {
        SCCommandEmpty { emptyContent() }
      } else {
        ScrollViewReader { proxy in
          SCCommandResults {
            ForEach(
              Array(filteredSections.enumerated()),
              id: \.element.id
            ) { sectionIndex, section in
              sectionHeader(section)
              ForEach(section.items.indices, id: \.self) { index in
                let item = section.items[index]
                row(for: item).id(itemID(item))
              }
              if sectionIndex < filteredSections.count - 1 {
                SCCommandSeparator().padding(.vertical, 4)
              }
            }
          }
          .onChange(of: highlightedID) { _, id in
            if let id { proxy.scrollTo(id) }
          }
        }
      }
    }
    .onAppear(perform: installKeyboardHandlers)
    .onDisappear {
      context.keyboard.moveHighlight = { _ in }
      context.keyboard.selectHighlighted = { false }
    }
    .onChange(of: context.query.wrappedValue) { _, _ in resetHighlight() }
    .onChange(of: visibleIDs) { _, _ in resetHighlight() }
  }

  private func row(for item: Item) -> some View {
    let id = itemID(item)
    let highlighted = id == highlightedID
    return Button {
      onSelect(item)
    } label: {
      rowContent(item, highlighted)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(rowShape)
        .background(highlighted ? theme.accent : .clear, in: rowShape)
        .foregroundStyle(highlighted ? theme.accentForeground : theme.foreground)
    }
    .buttonStyle(.plain)
    .disabled(context.isDisabled || !itemIsEnabled(item))
    .opacity(itemIsEnabled(item) ? 1 : 0.5)
    .onHover { hovering in
      if hovering, itemIsEnabled(item) { highlightedID = id }
    }
    .accessibilityLabel(itemText(item))
  }

  private var filteredSections: [SCCommandSection<Item>] {
    let query = context.query.wrappedValue.trimmingCharacters(in: .whitespaces)
    guard !query.isEmpty else { return sections.filter { !$0.items.isEmpty } }
    return sections.compactMap { section in
      let items = section.items.filter { filter($0, query) }
      guard !items.isEmpty else { return nil }
      return SCCommandSection(id: section.id, title: section.title, items: items)
    }
  }

  private var selectableItems: [Item] {
    filteredSections.flatMap(\.items).filter(itemIsEnabled)
  }

  private var visibleIDs: [AnyHashable] {
    selectableItems.map(itemID)
  }

  private var rowShape: RoundedRectangle {
    RoundedRectangle(cornerRadius: max(theme.radius - 4, 2), style: .continuous)
  }

  private func installKeyboardHandlers() {
    resetHighlight()
    context.keyboard.moveHighlight = moveHighlight
    context.keyboard.selectHighlighted = selectHighlighted
  }

  private func resetHighlight() {
    highlightedID = autoHighlight ? selectableItems.first.map(itemID) : nil
  }

  private func moveHighlight(by offset: Int) {
    let items = selectableItems
    guard !items.isEmpty else { return }
    guard
      let highlightedID,
      let index = items.firstIndex(where: { itemID($0) == highlightedID })
    else {
      self.highlightedID = (offset > 0 ? items.first : items.last).map(itemID)
      return
    }
    self.highlightedID = itemID(items[(index + offset + items.count) % items.count])
  }

  private func selectHighlighted() -> Bool {
    guard
      let highlightedID,
      let item = selectableItems.first(where: { itemID($0) == highlightedID })
    else { return false }
    onSelect(item)
    return true
  }
}

/// A data-driven convenience composed entirely from the public command parts.
public struct SCCommandCollection<Item>: View {
  private let sections: [SCCommandSection<Item>]
  private let externalQuery: Binding<String>?
  private let placeholder: String
  private let autoFocus: Bool
  private let itemID: (Item) -> AnyHashable
  private let itemText: (Item) -> String
  private let filter: (Item, String) -> Bool
  private let itemIsEnabled: (Item) -> Bool
  private let onSelect: (Item) -> Void
  private let rowContent: (Item, Bool) -> AnyView
  private let sectionHeader: (SCCommandSection<Item>) -> AnyView
  private let emptyContent: () -> AnyView

  public init<ID: Hashable, Row: View, Header: View, Empty: View>(
    sections: [SCCommandSection<Item>],
    id: KeyPath<Item, ID>,
    query: Binding<String>? = nil,
    placeholder: String = "Type a command or search…",
    autoFocus: Bool = true,
    itemText: @escaping (Item) -> String,
    filter: ((Item, String) -> Bool)? = nil,
    isItemEnabled: @escaping (Item) -> Bool = { _ in true },
    onSelect: @escaping (Item) -> Void,
    @ViewBuilder row: @escaping (_ item: Item, _ highlighted: Bool) -> Row,
    @ViewBuilder sectionHeader: @escaping (SCCommandSection<Item>) -> Header,
    @ViewBuilder empty: @escaping () -> Empty
  ) {
    self.sections = sections
    self.externalQuery = query
    self.placeholder = placeholder
    self.autoFocus = autoFocus
    self.itemID = { AnyHashable($0[keyPath: id]) }
    self.itemText = itemText
    self.filter =
      filter ?? { item, query in
        itemText(item).localizedCaseInsensitiveContains(query)
      }
    self.itemIsEnabled = isItemEnabled
    self.onSelect = onSelect
    self.rowContent = { AnyView(row($0, $1)) }
    self.sectionHeader = { AnyView(sectionHeader($0)) }
    self.emptyContent = { AnyView(empty()) }
  }

  public var body: some View {
    SCCommandRoot(query: externalQuery) {
      VStack(spacing: 0) {
        SCCommandInput(placeholder: placeholder, autoFocus: autoFocus)
        SCCommandSeparator()
        SCCommandDataCollection(
          sections: sections,
          id: itemID,
          itemText: itemText,
          filter: filter,
          isItemEnabled: itemIsEnabled,
          onSelect: onSelect,
          row: rowContent,
          sectionHeader: sectionHeader,
          empty: emptyContent
        )
      }
    }
  }
}

// MARK: - Component

/// A filterable command list — the swiftcn port of shadcn/ui's Command.
///
/// Renders a search field over grouped, keyboard-navigable results: ↑/↓ move
/// the highlight, Return runs the highlighted item, and typing filters by
/// title and keywords. Use it inline, or present it as a ⌘K palette with
/// `.scCommandPalette(isPresented:groups:)`.
///
///     SCCommandList(groups: [
///         SCCommandGroup(label: "Suggestions", items: [
///             SCCommandItem(title: "Calendar", systemImage: "calendar") { openCalendar() },
///             SCCommandItem(title: "Profile", systemImage: "person", shortcut: "⌘P") { openProfile() },
///         ]),
///     ])
public struct SCCommandList: View {
  @Environment(\.theme) private var theme

  private let groups: [SCCommandGroup]
  private let placeholder: String
  private let externalQuery: Binding<String>?
  /// Palette hook: when set, replaces the default "run the item's action"
  /// behavior so the presenter can dismiss first.
  private let onExecute: ((SCCommandItem) -> Void)?

  init(
    groups: [SCCommandGroup],
    placeholder: String,
    externalQuery: Binding<String>?,
    onExecute: ((SCCommandItem) -> Void)?
  ) {
    self.groups = groups
    self.placeholder = placeholder
    self.externalQuery = externalQuery
    self.onExecute = onExecute
  }

  /// Creates a command list that manages its own search text.
  public init(
    groups: [SCCommandGroup],
    placeholder: String = "Type a command or search…"
  ) {
    self.init(groups: groups, placeholder: placeholder, externalQuery: nil, onExecute: nil)
  }

  /// Creates a command list whose search text is owned by the caller.
  public init(
    groups: [SCCommandGroup],
    query: Binding<String>,
    placeholder: String = "Type a command or search…"
  ) {
    self.init(groups: groups, placeholder: placeholder, externalQuery: query, onExecute: nil)
  }

  public var body: some View {
    SCCommandCollection(
      sections: groups.map { SCCommandSection(id: $0.id, title: $0.label, items: $0.items) },
      id: \.id,
      query: externalQuery,
      placeholder: placeholder,
      itemText: { $0.title },
      filter: { item, query in item.matches(query) },
      onSelect: execute,
      row: { item, isHighlighted in
        HStack(spacing: 10) {
          if let systemImage = item.systemImage {
            Image(systemName: systemImage)
              .font(.system(size: 16))
              .frame(width: 20)
              .foregroundStyle(isHighlighted ? theme.accentForeground : theme.mutedForeground)
          }
          Text(item.title)
            .font(.subheadline)
            .lineLimit(1)
          Spacer(minLength: 8)
          if let shortcut = item.shortcut {
            SCKbd(shortcut)
          }
        }
      },
      sectionHeader: { section in
        if let title = section.title {
          Text(title)
            .font(.caption)
            .foregroundStyle(theme.mutedForeground)
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 4)
        }
      },
      empty: {
        Text("No results found.")
          .font(.footnote)
          .foregroundStyle(theme.mutedForeground)
      }
    )
  }

  private func execute(_ item: SCCommandItem) {
    if let onExecute {
      onExecute(item)
    } else {
      item.action()
    }
  }
}

// MARK: - Palette presentation

/// Presents arbitrary command composition in the shared dialog primitive.
public struct SCCommandDialog<CommandContent: View>: ViewModifier {
  @Binding private var isPresented: Bool
  private let title: String
  private let description: String
  private let showsCloseButton: Bool
  private let dismissOnScrimTap: Bool
  private let command: () -> CommandContent

  public init(
    isPresented: Binding<Bool>,
    title: String = "Command Palette",
    description: String = "Search for a command to run.",
    showsCloseButton: Bool = false,
    dismissOnScrimTap: Bool = true,
    @ViewBuilder content: @escaping () -> CommandContent
  ) {
    self._isPresented = isPresented
    self.title = title
    self.description = description
    self.showsCloseButton = showsCloseButton
    self.dismissOnScrimTap = dismissOnScrimTap
    self.command = content
  }

  public func body(content presenter: Content) -> some View {
    presenter.scDialog(
      isPresented: $isPresented,
      dismissOnScrimTap: dismissOnScrimTap
    ) {
      SCDialogContent(showCloseButton: showsCloseButton) {
        command()
          .frame(maxHeight: 400)
          .accessibilityLabel(title)
          .accessibilityHint(description)
          .onKeyPress(.escape) {
            isPresented = false
            return .handled
          }
      }
    }
  }
}

extension View {
  /// Presents a caller-composed command in a modal dialog.
  public func scCommandDialog<CommandContent: View>(
    isPresented: Binding<Bool>,
    title: String = "Command Palette",
    description: String = "Search for a command to run.",
    showsCloseButton: Bool = false,
    dismissOnScrimTap: Bool = true,
    @ViewBuilder content: @escaping () -> CommandContent
  ) -> some View {
    modifier(
      SCCommandDialog(
        isPresented: isPresented,
        title: title,
        description: description,
        showsCloseButton: showsCloseButton,
        dismissOnScrimTap: dismissOnScrimTap,
        content: content
      )
    )
  }

  /// Presents a floating ⌘K command palette over this view — shadcn's
  /// Command inside its Command Dialog.
  ///
  /// Pure SwiftUI overlay (same approach as `.scDialog`): a scrim that
  /// dismisses on tap, with the command list in a top-aligned panel.
  /// Escape dismisses; choosing an item dismisses the palette first, then
  /// runs the item's action. Attach it to the container the scrim should
  /// cover.
  ///
  ///     .scCommandPalette(isPresented: $showPalette, groups: [
  ///         SCCommandGroup(label: "Settings", items: [
  ///             SCCommandItem(title: "Profile", systemImage: "person", shortcut: "⌘P") { openProfile() },
  ///         ]),
  ///     ])
  ///
  /// - Parameters:
  ///   - isPresented: Controls the palette's visibility.
  ///   - groups: The command sections to search and run.
  ///   - placeholder: Prompt shown in the search field.
  public func scCommandPalette(
    isPresented: Binding<Bool>,
    groups: [SCCommandGroup],
    placeholder: String = "Type a command or search…"
  ) -> some View {
    modifier(
      SCCommandPaletteModifier(
        isPresented: isPresented,
        groups: groups,
        placeholder: placeholder
      ))
  }
}

private struct SCCommandPaletteModifier: ViewModifier {
  @Binding var isPresented: Bool
  var groups: [SCCommandGroup]
  var placeholder: String

  func body(content: Content) -> some View {
    content.scCommandDialog(isPresented: $isPresented) {
      SCCommandList(
        groups: groups,
        placeholder: placeholder,
        externalQuery: nil,
        onExecute: { item in
          isPresented = false
          item.action()
        }
      )
    }
  }
}
