// ============================================================
// Dialog.swift — swiftcn-ui
// Depends on: Theme/ · Button.swift
// ============================================================
import SwiftUI

// MARK: - Configuration

public enum SCDialogSize: CaseIterable, Equatable, Sendable {
  case small
  case `default`
  case large
}

// MARK: - Presentation environment

private struct SCDialogPresentation {
  var isPresented: Binding<Bool> = .constant(false)
  var dismissOnScrimTap = true
  var dismissOnEscape = true

  func present() {
    isPresented.wrappedValue = true
  }

  func dismiss() {
    isPresented.wrappedValue = false
  }
}

private struct SCDialogPresentationKey: EnvironmentKey {
  static let defaultValue = SCDialogPresentation()
}

extension EnvironmentValues {
  fileprivate var scDialogPresentation: SCDialogPresentation {
    get { self[SCDialogPresentationKey.self] }
    set { self[SCDialogPresentationKey.self] = newValue }
  }

  /// Dismisses the nearest enclosing swiftcn dialog.
  public var scDismissDialog: () -> Void {
    scDialogPresentation.dismiss
  }
}

// MARK: - Root

/// A composable modal dialog with caller-owned or internal presentation.
///
/// `SCDialog` is the native Root and Portal adaptation. It renders the trigger,
/// makes the underlying content inert while open, and presents the supplied
/// overlay and content in one shared layer.
public struct SCDialog<Trigger: View, DialogContent: View, Overlay: View>: View {
  @State private var internalIsPresented: Bool

  private let externalIsPresented: Binding<Bool>?
  private let dismissOnScrimTap: Bool
  private let dismissOnEscape: Bool
  private let onOpenChange: ((Bool) -> Void)?
  private let trigger: Trigger
  private let dialogContent: DialogContent
  private let overlay: Overlay

  public init(
    isPresented: Binding<Bool>,
    dismissOnScrimTap: Bool = true,
    dismissOnEscape: Bool = true,
    onOpenChange: ((Bool) -> Void)? = nil,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder overlay: () -> Overlay,
    @ViewBuilder content: () -> DialogContent
  ) {
    self.externalIsPresented = isPresented
    self._internalIsPresented = State(initialValue: isPresented.wrappedValue)
    self.dismissOnScrimTap = dismissOnScrimTap
    self.dismissOnEscape = dismissOnEscape
    self.onOpenChange = onOpenChange
    self.trigger = trigger()
    self.overlay = overlay()
    self.dialogContent = content()
  }

  public init(
    defaultPresented: Bool = false,
    dismissOnScrimTap: Bool = true,
    dismissOnEscape: Bool = true,
    onOpenChange: ((Bool) -> Void)? = nil,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder overlay: () -> Overlay,
    @ViewBuilder content: () -> DialogContent
  ) {
    self.externalIsPresented = nil
    self._internalIsPresented = State(initialValue: defaultPresented)
    self.dismissOnScrimTap = dismissOnScrimTap
    self.dismissOnEscape = dismissOnEscape
    self.onOpenChange = onOpenChange
    self.trigger = trigger()
    self.overlay = overlay()
    self.dialogContent = content()
  }

  public var body: some View {
    SCDialogPresentationLayer(
      isPresented: presented,
      dismissOnScrimTap: dismissOnScrimTap,
      dismissOnEscape: dismissOnEscape,
      presenter: trigger,
      overlay: overlay,
      dialog: dialogContent
    )
  }

  private var presented: Binding<Bool> {
    Binding {
      externalIsPresented?.wrappedValue ?? internalIsPresented
    } set: { newValue in
      let oldValue = externalIsPresented?.wrappedValue ?? internalIsPresented
      guard oldValue != newValue else { return }
      if let externalIsPresented {
        externalIsPresented.wrappedValue = newValue
      } else {
        internalIsPresented = newValue
      }
      onOpenChange?(newValue)
    }
  }
}

extension SCDialog where Overlay == SCDialogOverlay {
  public init(
    isPresented: Binding<Bool>,
    dismissOnScrimTap: Bool = true,
    dismissOnEscape: Bool = true,
    onOpenChange: ((Bool) -> Void)? = nil,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder content: () -> DialogContent
  ) {
    self.init(
      isPresented: isPresented,
      dismissOnScrimTap: dismissOnScrimTap,
      dismissOnEscape: dismissOnEscape,
      onOpenChange: onOpenChange,
      trigger: trigger,
      overlay: { SCDialogOverlay() },
      content: content
    )
  }

  public init(
    defaultPresented: Bool = false,
    dismissOnScrimTap: Bool = true,
    dismissOnEscape: Bool = true,
    onOpenChange: ((Bool) -> Void)? = nil,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder content: () -> DialogContent
  ) {
    self.init(
      defaultPresented: defaultPresented,
      dismissOnScrimTap: dismissOnScrimTap,
      dismissOnEscape: dismissOnEscape,
      onOpenChange: onOpenChange,
      trigger: trigger,
      overlay: { SCDialogOverlay() },
      content: content
    )
  }
}

// MARK: - Modifier convenience

extension View {
  /// Presents a caller-composed dialog over this container. This modifier is
  /// a thin convenience over the same presentation layer used by `SCDialog`.
  public func scDialog<DialogContent: View>(
    isPresented: Binding<Bool>,
    dismissOnScrimTap: Bool = true,
    dismissOnEscape: Bool = true,
    onOpenChange: ((Bool) -> Void)? = nil,
    @ViewBuilder content: @escaping () -> DialogContent
  ) -> some View {
    modifier(
      SCDialogModifier(
        isPresented: isPresented,
        dismissOnScrimTap: dismissOnScrimTap,
        dismissOnEscape: dismissOnEscape,
        onOpenChange: onOpenChange,
        dialog: content
      )
    )
  }
}

private struct SCDialogModifier<DialogContent: View>: ViewModifier {
  @Binding var isPresented: Bool
  let dismissOnScrimTap: Bool
  let dismissOnEscape: Bool
  let onOpenChange: ((Bool) -> Void)?
  let dialog: () -> DialogContent

  func body(content: Content) -> some View {
    SCDialogPresentationLayer(
      isPresented: presented,
      dismissOnScrimTap: dismissOnScrimTap,
      dismissOnEscape: dismissOnEscape,
      presenter: content,
      overlay: SCDialogOverlay(),
      dialog: dialog()
    )
  }

  private var presented: Binding<Bool> {
    Binding {
      isPresented
    } set: { newValue in
      guard isPresented != newValue else { return }
      isPresented = newValue
      onOpenChange?(newValue)
    }
  }
}

private struct SCDialogPresentationLayer<Presenter: View, Overlay: View, DialogContent: View>: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let isPresented: Binding<Bool>
  let dismissOnScrimTap: Bool
  let dismissOnEscape: Bool
  let presenter: Presenter
  let overlay: Overlay
  let dialog: DialogContent

  var body: some View {
    ZStack {
      presenter
        .disabled(isPresented.wrappedValue)
        .accessibilityHidden(isPresented.wrappedValue)

      if isPresented.wrappedValue {
        overlay
          .transition(.opacity)

        dialog
          .padding(24)
          .accessibilityAddTraits(.isModal)
          .transition(.scale(scale: 0.95).combined(with: .opacity))
      }
    }
    .environment(
      \.scDialogPresentation,
      SCDialogPresentation(
        isPresented: isPresented,
        dismissOnScrimTap: dismissOnScrimTap,
        dismissOnEscape: dismissOnEscape
      )
    )
    .onKeyPress(.escape) {
      guard isPresented.wrappedValue, dismissOnEscape else { return .ignored }
      isPresented.wrappedValue = false
      return .handled
    }
    #if os(macOS)
      .onExitCommand {
        if isPresented.wrappedValue, dismissOnEscape {
          isPresented.wrappedValue = false
        }
      }
    #endif
    .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: isPresented.wrappedValue)
  }
}

// MARK: - Trigger and overlay

/// Opens the enclosing `SCDialog` and restores keyboard focus when it closes.
public struct SCDialogTrigger<Label: View>: View {
  @Environment(\.scDialogPresentation) private var presentation
  @FocusState private var isFocused: Bool
  @State private var openedFromHere = false

  private let label: Label

  public init(@ViewBuilder label: () -> Label) {
    self.label = label()
  }

  public var body: some View {
    Button {
      openedFromHere = true
      presentation.present()
    } label: {
      label
    }
    .focused($isFocused)
    .onChange(of: presentation.isPresented.wrappedValue) { wasPresented, isPresented in
      if wasPresented, !isPresented, openedFromHere {
        isFocused = true
        openedFromHere = false
      }
    }
  }
}

extension SCDialogTrigger where Label == Text {
  public init(_ title: String) {
    self.init { Text(title) }
  }
}

/// The modal scrim. It dismisses only when the root allows scrim dismissal.
public struct SCDialogOverlay: View {
  @Environment(\.scDialogPresentation) private var presentation

  private let opacity: Double

  public init(opacity: Double = 0.5) {
    self.opacity = min(max(opacity, 0), 1)
  }

  public var body: some View {
    Color.black.opacity(opacity)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .ignoresSafeArea()
      .contentShape(Rectangle())
      .onTapGesture {
        if presentation.dismissOnScrimTap {
          presentation.dismiss()
        }
      }
      .accessibilityHidden(true)
  }
}

// MARK: - Content

/// The centered dialog surface. Include an `SCDialogTitle` in every dialog so
/// assistive technologies receive a meaningful modal heading.
public struct SCDialogContent<Content: View>: View {
  @Environment(\.theme) private var theme
  @Environment(\.scDialogPresentation) private var presentation
  @FocusState private var isFocused: Bool

  private let size: SCDialogSize
  private let maximumWidth: CGFloat?
  private let maxHeight: CGFloat?
  private let contentPadding: CGFloat
  private let showCloseButton: Bool
  private let content: Content

  public init(
    size: SCDialogSize = .default,
    maxWidth: CGFloat? = nil,
    maxHeight: CGFloat? = nil,
    contentPadding: CGFloat = 24,
    showCloseButton: Bool = true,
    @ViewBuilder content: () -> Content
  ) {
    self.size = size
    self.maximumWidth = maxWidth
    self.maxHeight = maxHeight
    self.contentPadding = max(contentPadding, 0)
    self.showCloseButton = showCloseButton
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      content
    }
    .padding(contentPadding)
    .frame(maxWidth: maximumWidth ?? width, maxHeight: maxHeight, alignment: .leading)
    .background {
      shape
        .fill(theme.background)
        .shadow(radius: 20, y: 8)
    }
    .overlay { shape.strokeBorder(theme.border) }
    .overlay(alignment: .topTrailing) {
      if showCloseButton {
        Button(action: presentation.dismiss) {
          Image(systemName: "xmark")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(theme.mutedForeground)
        }
        .buttonStyle(.sc(.ghost, size: .iconSM))
        .padding(8)
        .accessibilityLabel("Close")
      }
    }
    .foregroundStyle(theme.foreground)
    .accessibilityElement(children: .contain)
    .focusable()
    .focused($isFocused)
    .onAppear { isFocused = true }
  }

  private var width: CGFloat {
    switch size {
    case .small: 340
    case .default: 420
    case .large: 640
    }
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius + 2, style: .continuous)
  }
}

// MARK: - Header, title, and description

public struct SCDialogHeader<Content: View>: View {
  private let alignment: HorizontalAlignment
  private let content: Content

  public init(
    alignment: HorizontalAlignment = .leading,
    @ViewBuilder content: () -> Content
  ) {
    self.alignment = alignment
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: alignment, spacing: 6) {
      content
    }
    .frame(maxWidth: .infinity, alignment: alignment == .center ? .center : .leading)
  }
}

public struct SCDialogTitle<Content: View>: View {
  @Environment(\.theme) private var theme
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.headline)
      .foregroundStyle(theme.foreground)
      .accessibilityAddTraits(.isHeader)
  }
}

extension SCDialogTitle where Content == Text {
  public init(_ title: String) {
    self.init { Text(title) }
  }
}

public struct SCDialogDescription<Content: View>: View {
  @Environment(\.theme) private var theme
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.subheadline)
      .foregroundStyle(theme.mutedForeground)
  }
}

extension SCDialogDescription where Content == Text {
  public init(_ description: String) {
    self.init { Text(description) }
  }
}

// MARK: - Scroll content and footer

/// An inner scroll region for long dialog bodies. Place a footer after this
/// view to keep the footer visible while only the body scrolls.
public struct SCDialogScrollContent<Content: View>: View {
  private let maxHeight: CGFloat
  private let content: Content

  public init(
    maxHeight: CGFloat = 420,
    @ViewBuilder content: () -> Content
  ) {
    self.maxHeight = max(maxHeight, 80)
    self.content = content()
  }

  public var body: some View {
    ScrollView {
      content
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(maxHeight: maxHeight)
  }
}

public struct SCDialogFooter<Content: View>: View {
  private let showCloseButton: Bool
  private let content: Content

  public init(
    showCloseButton: Bool = false,
    @ViewBuilder content: () -> Content
  ) {
    self.showCloseButton = showCloseButton
    self.content = content()
  }

  public var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        content
        closeButton
      }
      VStack(alignment: .trailing, spacing: 8) {
        content
        closeButton
      }
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
  }

  @ViewBuilder
  private var closeButton: some View {
    if showCloseButton {
      SCDialogClose("Close")
        .buttonStyle(.sc(.outline))
    }
  }
}

// MARK: - Close

/// A caller-styled native button that dismisses the enclosing dialog before
/// running its optional action.
public struct SCDialogClose<Label: View>: View {
  @Environment(\.scDialogPresentation) private var presentation

  private let action: () -> Void
  private let label: Label

  public init(
    action: @escaping () -> Void = {},
    @ViewBuilder label: () -> Label
  ) {
    self.action = action
    self.label = label()
  }

  public var body: some View {
    Button {
      presentation.dismiss()
      action()
    } label: {
      label
    }
  }
}

extension SCDialogClose where Label == Text {
  public init(_ title: String = "Close", action: @escaping () -> Void = {}) {
    self.init(action: action) { Text(title) }
  }
}
