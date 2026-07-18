import SwiftUI

/// A searchable text input with optional open and clear controls.
public struct SCComboboxInput: View {
  @Environment(\.scComboboxContext) private var context
  @Environment(\.theme) private var theme
  @FocusState private var isFocused: Bool

  private let placeholder: String
  private let showsTrigger: Bool
  private let showsClear: Bool
  private let isInvalid: Bool
  private let autoFocus: Bool
  private let isEmbedded: Bool

  public init(
    placeholder: String = "Search…",
    showsTrigger: Bool = true,
    showsClear: Bool = false,
    isInvalid: Bool = false,
    autoFocus: Bool = false,
    isEmbedded: Bool = false
  ) {
    self.placeholder = placeholder
    self.showsTrigger = showsTrigger
    self.showsClear = showsClear
    self.isInvalid = isInvalid
    self.autoFocus = autoFocus
    self.isEmbedded = isEmbedded
  }

  public var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(theme.mutedForeground)
        .accessibilityHidden(true)
      TextField(
        placeholder,
        text: context.query,
        prompt: Text(placeholder).foregroundStyle(theme.mutedForeground)
      )
      .textFieldStyle(.plain)
      .focused($isFocused)
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
      if showsClear, !context.selectedValues.isEmpty {
        clearButton
      } else if showsTrigger {
        triggerButton
      }
    }
    .font(.subheadline)
    .foregroundStyle(theme.foreground)
    .padding(.horizontal, 10)
    .frame(minHeight: 36)
    .background {
      if !isEmbedded { shape.fill(theme.background) }
    }
    .overlay {
      if !isEmbedded { shape.strokeBorder(borderColor) }
    }
    .opacity(context.isDisabled ? 0.5 : 1)
    .disabled(context.isDisabled)
    .onTapGesture { context.isPresented.wrappedValue = true }
    .onChange(of: isFocused) { _, focused in
      if focused { context.isPresented.wrappedValue = true }
    }
    .onAppear {
      guard autoFocus else { return }
      DispatchQueue.main.async { isFocused = true }
    }
    .accessibilityHint(isInvalid ? "Invalid selection" : "")
  }

  private var triggerButton: some View {
    Button {
      context.isPresented.wrappedValue.toggle()
    } label: {
      Image(systemName: "chevron.down")
        .rotationEffect(.degrees(context.isPresented.wrappedValue ? 180 : 0))
        .frame(width: 24, height: 24)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(context.isPresented.wrappedValue ? "Close options" : "Open options")
  }

  private var clearButton: some View {
    Button(action: context.clear) {
      Image(systemName: "xmark")
        .frame(width: 24, height: 24)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Clear selection")
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
  }

  private var borderColor: Color {
    if isInvalid { return theme.destructive }
    return isFocused ? theme.ring : theme.input
  }
}

/// A state-aware button that opens and closes the nearest combobox root.
public struct SCComboboxTrigger<Content: View>: View {
  @Environment(\.scComboboxContext) private var context
  private let showsIndicator: Bool
  private let content: (Bool) -> Content

  public init(
    showsIndicator: Bool = true,
    @ViewBuilder content: @escaping (Bool) -> Content
  ) {
    self.showsIndicator = showsIndicator
    self.content = content
  }

  public var body: some View {
    Button {
      context.isPresented.wrappedValue.toggle()
    } label: {
      HStack(spacing: 8) {
        content(context.isPresented.wrappedValue)
        if showsIndicator {
          Image(systemName: "chevron.down")
            .rotationEffect(.degrees(context.isPresented.wrappedValue ? 180 : 0))
            .accessibilityHidden(true)
        }
      }
    }
    .disabled(context.isDisabled)
    .accessibilityValue(context.isPresented.wrappedValue ? "Expanded" : "Collapsed")
  }
}

/// Renders caller-defined content from the currently selected options.
public struct SCComboboxValue<Value: Hashable, Content: View>: View {
  @Environment(\.scComboboxContext) private var context
  private let options: [SCComboboxOption<Value>]
  private let content: ([SCComboboxOption<Value>]) -> Content

  public init(
    options: [SCComboboxOption<Value>],
    @ViewBuilder content: @escaping ([SCComboboxOption<Value>]) -> Content
  ) {
    self.options = options
    self.content = content
  }

  public var body: some View {
    content(options.filter { context.selectedValues.contains(AnyHashable($0.value)) })
  }
}

/// Clears every selected value in the nearest combobox root.
public struct SCComboboxClear<Content: View>: View {
  @Environment(\.scComboboxContext) private var context
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    Button(action: context.clear) { content }
      .disabled(context.isDisabled || context.selectedValues.isEmpty)
      .accessibilityLabel("Clear selection")
  }
}

/// Presents caller-composed combobox content in a native anchored popover.
public struct SCComboboxContent<Content: View>: View {
  @Environment(\.scComboboxContext) private var context
  @Environment(\.theme) private var theme
  private let width: CGFloat
  private let maxHeight: CGFloat
  private let alignment: SCOverlayAlignment
  private let content: Content

  public init(
    width: CGFloat = 240,
    maxHeight: CGFloat = 360,
    alignment: SCOverlayAlignment = .end,
    @ViewBuilder content: () -> Content
  ) {
    self.width = width
    self.maxHeight = maxHeight
    self.alignment = alignment
    self.content = content()
  }

  public var body: some View {
    SCOverlayPortal(
      isPresented: context.isPresented,
      width: width,
      maxHeight: maxHeight,
      alignment: alignment
    ) {
      content
        .foregroundStyle(theme.popoverForeground)
        .environment(\.scComboboxContext, context)
        .environment(\.theme, theme)
    }
  }
}

/// A scroll container for manually composed groups and items.
public struct SCComboboxList<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    ScrollView(.vertical, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 0) { content }
        .padding(6)
    }
  }
}

/// A selectable, state-aware item for manually composed combobox lists.
public struct SCComboboxItem<Value: Hashable, Content: View>: View {
  @Environment(\.scComboboxContext) private var context
  @Environment(\.theme) private var theme
  private let value: Value
  private let isDisabled: Bool
  private let content: (Bool) -> Content

  public init(
    value: Value,
    isDisabled: Bool = false,
    @ViewBuilder content: @escaping (Bool) -> Content
  ) {
    self.value = value
    self.isDisabled = isDisabled
    self.content = content
  }

  public var body: some View {
    let isSelected = context.selectedValues.contains(AnyHashable(value))
    Button {
      context.select(AnyHashable(value))
    } label: {
      HStack(spacing: 8) {
        content(isSelected)
        Spacer(minLength: 8)
        Image(systemName: "checkmark")
          .opacity(isSelected ? 1 : 0)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(shape)
    }
    .buttonStyle(.plain)
    .disabled(context.isDisabled || isDisabled)
    .opacity(isDisabled ? 0.5 : 1)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: max(theme.radius - 4, 2), style: .continuous)
  }
}

/// A visual group for manually composed combobox items.
public struct SCComboboxGroup<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) { content }
  }
}

/// A muted group label for combobox collections.
public struct SCComboboxLabel<Content: View>: View {
  @Environment(\.theme) private var theme
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.caption)
      .foregroundStyle(theme.mutedForeground)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
  }
}

/// A filterable, grouped, keyboard-navigable collection of typed options.
