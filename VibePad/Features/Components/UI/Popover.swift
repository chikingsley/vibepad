// ============================================================
// Popover.swift — swiftcn-ui
// Depends on: Theme/
// ============================================================
import SwiftUI

// MARK: - Configuration

public enum SCPopoverSide: CaseIterable, Hashable, Sendable {
  case top
  case bottom
  /// Logical inline-start placement.
  case leading
  /// Logical inline-end placement.
  case trailing
  /// Physical left placement regardless of layout direction.
  case left
  /// Physical right placement regardless of layout direction.
  case right
}

public enum SCPopoverAlignment: CaseIterable, Hashable, Sendable {
  case start
  case center
  case end
}

public enum SCPopoverCompactAdaptation: CaseIterable, Hashable, Sendable {
  /// Preserve an anchored popover in compact environments.
  case popover
  /// Deliberately adapt to a sheet in compact environments.
  case sheet
  /// Let SwiftUI choose its platform default.
  case automatic
}

public enum SCPopoverChangeReason: Hashable, Sendable {
  case triggerPress
  case triggerHover
  /// SwiftUI reported dismissal without exposing whether it was an outside
  /// press, system Escape handling, or another native presentation event.
  case nativeDismissal
  case escapeKey
  case closePress
  case focusOut
  case programmatic
}

/// Real side and alignment configuration for the native popover attachment.
public struct SCPopoverPosition: Hashable, Sendable {
  public var side: SCPopoverSide
  public var alignment: SCPopoverAlignment

  public init(
    side: SCPopoverSide = .bottom,
    alignment: SCPopoverAlignment = .center
  ) {
    self.side = side
    self.alignment = alignment
  }

  fileprivate func arrowEdge(layoutDirection: LayoutDirection) -> Edge {
    switch side {
    case .top:
      return .bottom
    case .bottom:
      return .top
    case .leading:
      return .trailing
    case .trailing:
      return .leading
    case .left:
      return layoutDirection == .leftToRight ? .trailing : .leading
    case .right:
      return layoutDirection == .leftToRight ? .leading : .trailing
    }
  }

  fileprivate func attachmentAnchor(
    layoutDirection: LayoutDirection
  ) -> PopoverAttachmentAnchor {
    .point(attachmentPoint(layoutDirection: layoutDirection))
  }

  private func attachmentPoint(layoutDirection: LayoutDirection) -> UnitPoint {
    let startX: CGFloat = layoutDirection == .leftToRight ? 0 : 1
    let endX: CGFloat = layoutDirection == .leftToRight ? 1 : 0

    switch side {
    case .top:
      return UnitPoint(x: horizontalCoordinate(start: startX, end: endX), y: 0)
    case .bottom:
      return UnitPoint(x: horizontalCoordinate(start: startX, end: endX), y: 1)
    case .leading:
      return UnitPoint(x: startX, y: verticalCoordinate)
    case .trailing:
      return UnitPoint(x: endX, y: verticalCoordinate)
    case .left:
      return UnitPoint(x: 0, y: verticalCoordinate)
    case .right:
      return UnitPoint(x: 1, y: verticalCoordinate)
    }
  }

  private func horizontalCoordinate(start: CGFloat, end: CGFloat) -> CGFloat {
    switch alignment {
    case .start: start
    case .center: 0.5
    case .end: end
    }
  }

  private var verticalCoordinate: CGFloat {
    switch alignment {
    case .start: 0
    case .center: 0.5
    case .end: 1
    }
  }

  fileprivate init(arrowEdge: Edge) {
    switch arrowEdge {
    case .top:
      self.init(side: .bottom)
    case .bottom:
      self.init(side: .top)
    case .leading:
      self.init(side: .trailing)
    case .trailing:
      self.init(side: .leading)
    }
  }
}

// MARK: - Shared context

private struct SCPopoverContext {
  var isPresented = false
  var setPresented: (Bool, SCPopoverChangeReason) -> Void = { _, _ in }
  var scheduleHoverOpen: (Duration, Duration) -> Void = { _, _ in }
  var scheduleHoverClose: () -> Void = {}
  var cancelHoverClose: () -> Void = {}
}

private struct SCPopoverContextKey: EnvironmentKey {
  static var defaultValue: SCPopoverContext { SCPopoverContext() }
}

private struct SCPopoverDismissActionKey: EnvironmentKey {
  static var defaultValue: () -> Void { {} }
}

extension EnvironmentValues {
  fileprivate var scPopoverContext: SCPopoverContext {
    get { self[SCPopoverContextKey.self] }
    set { self[SCPopoverContextKey.self] = newValue }
  }

  /// Dismisses the nearest enclosing `SCPopover`.
  public var scDismissPopover: () -> Void {
    get { self[SCPopoverDismissActionKey.self] }
    set { self[SCPopoverDismissActionKey.self] = newValue }
  }
}

// MARK: - Root

/// A controlled or internally managed native popover with independent Trigger
/// and Content slots.
///
/// SwiftUI owns the real portal, anchoring, arrow, collision avoidance,
/// outside dismissal, window/dialog stacking, focus movement, and accessibility
/// presentation. The component owns state, trigger interaction, optional hover
/// timing, semantic content parts, and theme chrome.
public struct SCPopover<Trigger: View, PopoverContent: View>: View {
  private let externalIsPresented: Binding<Bool>?
  private let defaultPresented: Bool
  private let position: SCPopoverPosition
  private let compactAdaptation: SCPopoverCompactAdaptation
  private let isDisabled: Bool
  private let onPresentedChange: ((Bool, SCPopoverChangeReason) -> Void)?
  private let trigger: Trigger
  private let popoverContent: PopoverContent

  public init(
    isPresented: Binding<Bool>,
    position: SCPopoverPosition = SCPopoverPosition(),
    compactAdaptation: SCPopoverCompactAdaptation = .popover,
    isDisabled: Bool = false,
    onPresentedChange: ((Bool, SCPopoverChangeReason) -> Void)? = nil,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder content: () -> PopoverContent
  ) {
    self.externalIsPresented = isPresented
    self.defaultPresented = isPresented.wrappedValue
    self.position = position
    self.compactAdaptation = compactAdaptation
    self.isDisabled = isDisabled
    self.onPresentedChange = onPresentedChange
    self.trigger = trigger()
    self.popoverContent = content()
  }

  public init(
    defaultPresented: Bool = false,
    position: SCPopoverPosition = SCPopoverPosition(),
    compactAdaptation: SCPopoverCompactAdaptation = .popover,
    isDisabled: Bool = false,
    onPresentedChange: ((Bool, SCPopoverChangeReason) -> Void)? = nil,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder content: () -> PopoverContent
  ) {
    self.externalIsPresented = nil
    self.defaultPresented = defaultPresented
    self.position = position
    self.compactAdaptation = compactAdaptation
    self.isDisabled = isDisabled
    self.onPresentedChange = onPresentedChange
    self.trigger = trigger()
    self.popoverContent = content()
  }

  public var body: some View {
    SCPopoverStateContainer(
      externalIsPresented: externalIsPresented,
      defaultPresented: defaultPresented,
      position: position,
      compactAdaptation: compactAdaptation,
      isDisabled: isDisabled,
      onPresentedChange: onPresentedChange,
      trigger: trigger,
      popoverContent: popoverContent
    )
  }
}

private struct SCPopoverStateContainer<Trigger: View, PopoverContent: View>: View {
  @State private var internalIsPresented: Bool
  @State private var hoverOwnsPresentation = false
  @State private var hoverCloseDelay: Duration = .zero
  @State private var openTask: Task<Void, Never>?
  @State private var closeTask: Task<Void, Never>?

  let externalIsPresented: Binding<Bool>?
  let position: SCPopoverPosition
  let compactAdaptation: SCPopoverCompactAdaptation
  let isDisabled: Bool
  let onPresentedChange: ((Bool, SCPopoverChangeReason) -> Void)?
  let trigger: Trigger
  let popoverContent: PopoverContent

  init(
    externalIsPresented: Binding<Bool>?,
    defaultPresented: Bool,
    position: SCPopoverPosition,
    compactAdaptation: SCPopoverCompactAdaptation,
    isDisabled: Bool,
    onPresentedChange: ((Bool, SCPopoverChangeReason) -> Void)?,
    trigger: Trigger,
    popoverContent: PopoverContent
  ) {
    self.externalIsPresented = externalIsPresented
    self.position = position
    self.compactAdaptation = compactAdaptation
    self.isDisabled = isDisabled
    self.onPresentedChange = onPresentedChange
    self.trigger = trigger
    self.popoverContent = popoverContent
    self._internalIsPresented = State(initialValue: defaultPresented)
  }

  var body: some View {
    trigger
      .environment(\.scPopoverContext, context)
      .disabled(isDisabled)
      .modifier(
        SCPopoverPresentationHost(
          isPresented: presentation,
          position: position,
          compactAdaptation: compactAdaptation,
          popoverContent: popoverBody
        )
      )
      .onDisappear {
        openTask?.cancel()
        closeTask?.cancel()
      }
  }

  private var isPresented: Bool {
    externalIsPresented?.wrappedValue ?? internalIsPresented
  }

  private var presentation: Binding<Bool> {
    Binding(
      get: { isPresented },
      set: { nextValue in
        guard !nextValue else { return }
        setPresented(false, reason: .nativeDismissal)
      }
    )
  }

  private var context: SCPopoverContext {
    SCPopoverContext(
      isPresented: isPresented,
      setPresented: setPresented,
      scheduleHoverOpen: scheduleHoverOpen,
      scheduleHoverClose: scheduleHoverClose,
      cancelHoverClose: cancelHoverClose
    )
  }

  private var popoverBody: some View {
    popoverContent
      .environment(\.scPopoverContext, context)
      .environment(\.scDismissPopover) {
        setPresented(false, reason: .programmatic)
      }
  }

  private func setPresented(_ nextValue: Bool, reason: SCPopoverChangeReason) {
    openTask?.cancel()
    closeTask?.cancel()
    guard isPresented != nextValue else { return }

    hoverOwnsPresentation = reason == .triggerHover && nextValue
    if let externalIsPresented {
      externalIsPresented.wrappedValue = nextValue
    } else {
      internalIsPresented = nextValue
    }
    onPresentedChange?(nextValue, reason)
  }

  private func scheduleHoverOpen(openDelay: Duration, closeDelay: Duration) {
    closeTask?.cancel()
    openTask?.cancel()
    hoverCloseDelay = closeDelay
    openTask = Task { @MainActor in
      do {
        try await Task.sleep(for: openDelay)
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      setPresented(true, reason: .triggerHover)
    }
  }

  private func scheduleHoverClose() {
    openTask?.cancel()
    guard hoverOwnsPresentation else { return }
    closeTask?.cancel()
    closeTask = Task { @MainActor in
      do {
        try await Task.sleep(for: hoverCloseDelay)
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      setPresented(false, reason: .focusOut)
    }
  }

  private func cancelHoverClose() {
    closeTask?.cancel()
  }
}

// MARK: - Native presentation host

private struct SCPopoverPresentationHost<PopoverContent: View>: ViewModifier {
  @Environment(\.layoutDirection) private var layoutDirection

  let isPresented: Binding<Bool>
  let position: SCPopoverPosition
  let compactAdaptation: SCPopoverCompactAdaptation
  let popoverContent: PopoverContent

  func body(content: Content) -> some View {
    content.popover(
      isPresented: isPresented,
      attachmentAnchor: position.attachmentAnchor(layoutDirection: layoutDirection),
      arrowEdge: position.arrowEdge(layoutDirection: layoutDirection)
    ) {
      popoverContent.modifier(
        SCPopoverCompactAdaptationModifier(adaptation: compactAdaptation)
      )
    }
  }
}

private struct SCPopoverCompactAdaptationModifier: ViewModifier {
  let adaptation: SCPopoverCompactAdaptation

  @ViewBuilder
  func body(content: Content) -> some View {
    switch adaptation {
    case .popover:
      content.presentationCompactAdaptation(.popover)
    case .sheet:
      content.presentationCompactAdaptation(.sheet)
    case .automatic:
      content
    }
  }
}

// MARK: - Trigger

/// A real native button that toggles its enclosing popover.
public struct SCPopoverTrigger<Label: View>: View {
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.scPopoverContext) private var context

  private let isDisabled: Bool
  private let opensOnHover: Bool
  private let openDelay: Duration
  private let closeDelay: Duration
  private let label: Label

  public init(
    isDisabled: Bool = false,
    opensOnHover: Bool = false,
    openDelay: Duration = .milliseconds(300),
    closeDelay: Duration = .zero,
    @ViewBuilder label: () -> Label
  ) {
    self.isDisabled = isDisabled
    self.opensOnHover = opensOnHover
    self.openDelay = openDelay
    self.closeDelay = closeDelay
    self.label = label()
  }

  public var body: some View {
    Button {
      context.setPresented(!context.isPresented, .triggerPress)
    } label: {
      label
    }
    .disabled(isDisabled)
    .onHover { isHovered in
      guard opensOnHover, isEnabled, !isDisabled else { return }
      if isHovered {
        context.scheduleHoverOpen(openDelay, closeDelay)
      } else {
        context.scheduleHoverClose()
      }
    }
    .accessibilityValue(context.isPresented ? "Expanded" : "Collapsed")
  }
}

extension SCPopoverTrigger where Label == Text {
  public init(
    _ title: String,
    isDisabled: Bool = false,
    opensOnHover: Bool = false,
    openDelay: Duration = .milliseconds(300),
    closeDelay: Duration = .zero
  ) {
    self.init(
      isDisabled: isDisabled,
      opensOnHover: opensOnHover,
      openDelay: openDelay,
      closeDelay: closeDelay
    ) {
      Text(title)
    }
  }
}

// MARK: - Content parts

/// The themed popup surface for arbitrary rich content, including forms.
public struct SCPopoverContent<Content: View>: View {
  @Environment(\.scPopoverContext) private var context
  @Environment(\.theme) private var theme

  private let padding: CGFloat
  private let width: CGFloat?
  private let minimumWidth: CGFloat?
  private let maximumWidth: CGFloat?
  private let content: Content

  public init(
    padding: CGFloat = 16,
    width: CGFloat? = 288,
    minimumWidth: CGFloat? = nil,
    maximumWidth: CGFloat? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.padding = max(padding, 0)
    self.width = width.map { max($0, 0) }
    self.minimumWidth = minimumWidth.map { max($0, 0) }
    self.maximumWidth = maximumWidth.map { max($0, 0) }
    self.content = content()
  }

  public var body: some View {
    content
      .padding(padding)
      .frame(
        minWidth: minimumWidth,
        idealWidth: width,
        maxWidth: maximumWidth,
        alignment: .leading
      )
      .frame(width: fixedWidth, alignment: .leading)
      .foregroundStyle(theme.popoverForeground)
      .presentationBackground(theme.popover)
      .onHover { isHovered in
        if isHovered {
          context.cancelHoverClose()
        } else {
          context.scheduleHoverClose()
        }
      }
      .onKeyPress(.escape) {
        context.setPresented(false, .escapeKey)
        return .handled
      }
      .accessibilityElement(children: .contain)
  }

  private var fixedWidth: CGFloat? {
    guard minimumWidth == nil, maximumWidth == nil else { return nil }
    return width
  }
}

/// A compact vertical heading group for title and description parts.
public struct SCPopoverHeader<Content: View>: View {
  private let spacing: CGFloat
  private let content: Content

  public init(spacing: CGFloat = 4, @ViewBuilder content: () -> Content) {
    self.spacing = max(spacing, 0)
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: spacing) { content }
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The semantic heading that labels popover content.
public struct SCPopoverTitle<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.subheadline.weight(.medium))
      .accessibilityAddTraits(.isHeader)
  }
}

extension SCPopoverTitle where Content == Text {
  public init(_ title: String) {
    self.init { Text(title) }
  }
}

/// Supporting text associated with the nearest popover title.
public struct SCPopoverDescription<Content: View>: View {
  @Environment(\.theme) private var theme

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.footnote)
      .foregroundStyle(theme.mutedForeground)
  }
}

extension SCPopoverDescription where Content == Text {
  public init(_ description: String) {
    self.init { Text(description) }
  }
}

/// A real native button that dismisses the nearest popover before invoking the
/// caller's optional action.
public struct SCPopoverClose<Label: View>: View {
  @Environment(\.scPopoverContext) private var context

  private let isDisabled: Bool
  private let action: (() -> Void)?
  private let label: Label

  public init(
    isDisabled: Bool = false,
    action: (() -> Void)? = nil,
    @ViewBuilder label: () -> Label
  ) {
    self.isDisabled = isDisabled
    self.action = action
    self.label = label()
  }

  public var body: some View {
    Button {
      context.setPresented(false, .closePress)
      action?()
    } label: {
      label
    }
    .disabled(isDisabled)
  }
}

extension SCPopoverClose where Label == Text {
  public init(
    _ title: String,
    isDisabled: Bool = false,
    action: (() -> Void)? = nil
  ) {
    self.init(isDisabled: isDisabled, action: action) {
      Text(title)
    }
  }
}

// MARK: - Presentation convenience

extension View {
  /// Presents caller-controlled content through the same native presentation
  /// host as `SCPopover`. The view remains its own real trigger; this modifier
  /// does not wrap an existing Button inside another Button.
  public func scPopover<PopoverContent: View>(
    isPresented: Binding<Bool>,
    arrowEdge: Edge = .top,
    compactAdaptation: SCPopoverCompactAdaptation = .popover,
    @ViewBuilder content: @escaping () -> PopoverContent
  ) -> some View {
    modifier(
      SCPopoverPresentationHost(
        isPresented: isPresented,
        position: SCPopoverPosition(arrowEdge: arrowEdge),
        compactAdaptation: compactAdaptation,
        popoverContent: SCPopoverContent { content() }
      )
    )
  }

  /// Position-aware form of `.scPopover` for logical and physical side
  /// placement plus start, center, or end attachment.
  public func scPopover<PopoverContent: View>(
    isPresented: Binding<Bool>,
    position: SCPopoverPosition,
    compactAdaptation: SCPopoverCompactAdaptation = .popover,
    @ViewBuilder content: @escaping () -> PopoverContent
  ) -> some View {
    modifier(
      SCPopoverPresentationHost(
        isPresented: isPresented,
        position: position,
        compactAdaptation: compactAdaptation,
        popoverContent: SCPopoverContent { content() }
      )
    )
  }
}
