// ============================================================
// InputGroup.swift — swiftcn-ui
// Depends on: Button.swift · Field.swift · Input.swift · InputGroupContext.swift · Textarea.swift · Theme/
// ============================================================
import SwiftUI

// MARK: - Typed group builder

public enum SCInputGroupAddonAlignment: Hashable, Sendable {
  case inlineStart
  case inlineEnd
  case blockStart
  case blockEnd
}

public struct SCInputGroupElement {
  fileprivate enum Placement {
    case control
    case addon(SCInputGroupAddonAlignment)
  }

  fileprivate let placement: Placement
  fileprivate let isMultiline: Bool
  fileprivate let view: AnyView

  fileprivate init<Content: View>(
    placement: Placement,
    isMultiline: Bool = false,
    content: Content
  ) {
    self.placement = placement
    self.isMultiline = isMultiline
    self.view = AnyView(content)
  }
}

@resultBuilder
@MainActor
public enum SCInputGroupBuilder {
  public static func buildBlock(_ components: [SCInputGroupElement]...) -> [SCInputGroupElement] {
    components.flatMap { $0 }
  }

  public static func buildExpression<Value: InputConvertible>(
    _ expression: SCInputGroupInput<Value>
  ) -> [SCInputGroupElement] {
    [expression.element]
  }

  public static func buildExpression(
    _ expression: SCInputGroupTextarea
  ) -> [SCInputGroupElement] {
    [expression.element]
  }

  public static func buildExpression<Content: View>(
    _ expression: SCInputGroupAddon<Content>
  ) -> [SCInputGroupElement] {
    [expression.element]
  }

  public static func buildOptional(_ component: [SCInputGroupElement]?) -> [SCInputGroupElement] {
    component ?? []
  }

  public static func buildEither(first component: [SCInputGroupElement]) -> [SCInputGroupElement] {
    component
  }

  public static func buildEither(second component: [SCInputGroupElement]) -> [SCInputGroupElement] {
    component
  }

  public static func buildArray(_ components: [[SCInputGroupElement]]) -> [SCInputGroupElement] {
    components.flatMap { $0 }
  }

  public static func buildLimitedAvailability(
    _ component: [SCInputGroupElement]
  ) -> [SCInputGroupElement] {
    component
  }
}

// MARK: - Root

/// A compound input surface that owns one border, focus ring, invalid state,
/// and disabled treatment for its typed input or textarea plus arbitrary
/// addons.
///
/// The result builder structurally orders inline and block addons, so callers
/// can declare parts in the same order as shadcn examples without manually
/// rearranging the SwiftUI layout.
public struct SCInputGroup: View {
  @Environment(\.theme) private var theme
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.scFieldInvalid) private var fieldIsInvalid

  @State private var focusRequestID = 0
  @State private var isControlFocused = false
  @State private var childIsInvalid = false

  private let explicitIsInvalid: Bool?
  private let elements: [SCInputGroupElement]

  public init(
    isInvalid: Bool? = nil,
    @SCInputGroupBuilder content: () -> [SCInputGroupElement]
  ) {
    self.explicitIsInvalid = isInvalid
    self.elements = content()
  }

  public var body: some View {
    VStack(spacing: 0) {
      region(.blockStart)

      HStack(alignment: hasMultilineControl ? .top : .center, spacing: 8) {
        inlineRegion(.inlineStart)
        controlRegion
        inlineRegion(.inlineEnd)
      }
      .padding(.horizontal, 12)
      .frame(minHeight: hasMultilineControl ? nil : 40, alignment: .leading)

      region(.blockEnd)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(theme.background, in: shape)
    .overlay(shape.strokeBorder(strokeColor, lineWidth: isControlFocused ? 1.5 : 1))
    .contentShape(shape)
    .opacity(isEnabled ? 1 : 0.5)
    .environment(
      \.scInputGroupControl,
      SCInputGroupControlContext(
        isGrouped: true,
        focusRequestID: focusRequestID,
        requestFocus: { focusRequestID &+= 1 },
        reportFocus: { isControlFocused = $0 }
      )
    )
    .onPreferenceChange(SCInputGroupInvalidPreferenceKey.self) {
      childIsInvalid = $0
    }
    .animation(.easeOut(duration: 0.15), value: isControlFocused)
  }

  private var hasMultilineControl: Bool {
    elements.contains { element in
      if case .control = element.placement {
        return element.isMultiline
      }
      return false
    }
  }

  private var resolvedIsInvalid: Bool {
    explicitIsInvalid ?? (fieldIsInvalid || childIsInvalid)
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
  }

  private var strokeColor: Color {
    if resolvedIsInvalid {
      theme.destructive
    } else if isControlFocused {
      theme.ring
    } else {
      theme.input
    }
  }

  @ViewBuilder
  private var controlRegion: some View {
    let controls = elements.filter {
      if case .control = $0.placement { return true }
      return false
    }

    ForEach(Array(controls.enumerated()), id: \.offset) { _, element in
      element.view
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder
  private func inlineRegion(_ alignment: SCInputGroupAddonAlignment) -> some View {
    let addons = addonElements(alignment)
    ForEach(Array(addons.enumerated()), id: \.offset) { _, element in
      element.view
    }
  }

  @ViewBuilder
  private func region(_ alignment: SCInputGroupAddonAlignment) -> some View {
    let addons = addonElements(alignment)
    if !addons.isEmpty {
      HStack(spacing: 8) {
        ForEach(Array(addons.enumerated()), id: \.offset) { _, element in
          element.view
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func addonElements(_ alignment: SCInputGroupAddonAlignment) -> [SCInputGroupElement] {
    elements.filter { element in
      if case .addon(let elementAlignment) = element.placement {
        return elementAlignment == alignment
      }
      return false
    }
  }
}

// MARK: - Input control

/// An `SCInput` control without independent chrome, for use inside
/// `SCInputGroup`.
public struct SCInputGroupInput<Value: InputConvertible>: View {
  fileprivate let element: SCInputGroupElement

  public init(
    _ placeholder: String,
    value: Binding<Value>,
    kind: SCInputKind = .automatic,
    isInvalid: Bool? = nil,
    onSubmit: (() -> Void)? = nil
  ) {
    self.element = SCInputGroupElement(
      placement: .control,
      content: SCInput(
        placeholder,
        value: value,
        kind: kind,
        isInvalid: isInvalid.map { $0 ? .invalid : .valid } ?? .inherited,
        onSubmit: onSubmit
      )
    )
  }

  public var body: some View { element.view }
}

extension SCInputGroupInput where Value == String {
  public init(
    _ placeholder: String = "",
    text: Binding<String>,
    secure: Bool = false,
    kind: SCInputKind = .automatic,
    isInvalid: Bool? = nil,
    onSubmit: (() -> Void)? = nil
  ) {
    self.element = SCInputGroupElement(
      placement: .control,
      content: SCInput(
        placeholder,
        text: text,
        secure: secure,
        kind: kind,
        isInvalid: isInvalid.map { $0 ? .invalid : .valid } ?? .inherited,
        onSubmit: onSubmit
      )
    )
  }
}

// MARK: - Textarea control

/// An `SCTextarea` control without independent chrome, for use inside
/// `SCInputGroup`.
public struct SCInputGroupTextarea: View {
  fileprivate let element: SCInputGroupElement

  public init(
    _ placeholder: String,
    text: Binding<String>,
    minHeight: CGFloat = 100,
    isInvalid: Bool? = nil
  ) {
    self.element = SCInputGroupElement(
      placement: .control,
      isMultiline: true,
      content: SCTextarea(
        placeholder,
        text: text,
        minHeight: minHeight,
        isInvalid: isInvalid.map { $0 ? .invalid : .valid } ?? .inherited
      )
    )
  }

  public var body: some View { element.view }
}

// MARK: - Addon

/// Arbitrary inline or block content attached to an input group. Tapping
/// noninteractive addon content requests focus for the real control; nested
/// buttons retain their own action handling.
public struct SCInputGroupAddon<Content: View>: View {
  @Environment(\.scInputGroupControl) private var groupControl

  private let alignment: SCInputGroupAddonAlignment
  private let content: Content

  fileprivate var element: SCInputGroupElement {
    SCInputGroupElement(
      placement: .addon(alignment),
      content: self
    )
  }

  public init(
    alignment: SCInputGroupAddonAlignment = .inlineStart,
    @ViewBuilder content: () -> Content
  ) {
    self.alignment = alignment
    self.content = content()
  }

  public var body: some View {
    HStack(spacing: 6) {
      content
    }
    .frame(
      maxWidth: isBlock ? .infinity : nil,
      alignment: isBlock ? .leading : .center
    )
    .contentShape(Rectangle())
    .onTapGesture { groupControl.requestFocus() }
    .accessibilityElement(children: .contain)
  }

  private var isBlock: Bool {
    alignment == .blockStart || alignment == .blockEnd
  }
}

// MARK: - Addon button and text

public enum SCInputGroupButtonSize: Hashable, Sendable {
  case xs
  case sm
  case iconXS
  case iconSM

  fileprivate var buttonSize: SCButtonSize {
    switch self {
    case .xs: .xs
    case .sm: .sm
    case .iconXS: .iconXS
    case .iconSM: .iconSM
    }
  }
}

/// A real native Button sized for an input-group addon.
public struct SCInputGroupButton<Label: View>: View {
  private let variant: SCButtonVariant
  private let size: SCInputGroupButtonSize
  private let isDisabled: Bool
  private let action: () -> Void
  private let label: Label

  public init(
    variant: SCButtonVariant = .ghost,
    size: SCInputGroupButtonSize = .xs,
    isDisabled: Bool = false,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) {
    self.variant = variant
    self.size = size
    self.isDisabled = isDisabled
    self.action = action
    self.label = label()
  }

  public var body: some View {
    Button(action: action) {
      label
    }
    .buttonStyle(.sc(variant, size: size.buttonSize))
    .disabled(isDisabled)
  }
}

extension SCInputGroupButton where Label == Text {
  public init(
    _ title: String,
    variant: SCButtonVariant = .ghost,
    size: SCInputGroupButtonSize = .xs,
    isDisabled: Bool = false,
    action: @escaping () -> Void
  ) {
    self.init(
      variant: variant,
      size: size,
      isDisabled: isDisabled,
      action: action,
      label: { Text(title) }
    )
  }
}

/// Arbitrary noninteractive text or icon content for an addon.
public struct SCInputGroupText<Content: View>: View {
  @Environment(\.theme) private var theme

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.caption)
      .foregroundStyle(theme.mutedForeground)
  }
}

extension SCInputGroupText where Content == Text {
  public init(_ text: String) {
    self.init { Text(text) }
  }
}
