// ============================================================
// AlertDialog.swift — swiftcn-ui
// Depends on: Theme/, Button.swift (SCButtonStyle)
// ============================================================
import SwiftUI

// MARK: - Configuration

/// The intent of an alert dialog's confirming action.
public enum SCAlertDialogRole: CaseIterable, Equatable, Sendable {
  case `default`, destructive
}

public enum SCAlertDialogSize: CaseIterable, Equatable, Sendable {
  case `default`, small
}

// MARK: - Presentation environment

struct SCAlertDialogPresentation {
  var isPresented: Binding<Bool> = .constant(false)

  func present() {
    isPresented.wrappedValue = true
  }

  func dismiss() {
    isPresented.wrappedValue = false
  }
}

struct SCAlertDialogPresentationKey: EnvironmentKey {
  static let defaultValue = SCAlertDialogPresentation()
}

extension EnvironmentValues {
  var scAlertDialogPresentation: SCAlertDialogPresentation {
    get { self[SCAlertDialogPresentationKey.self] }
    set { self[SCAlertDialogPresentationKey.self] = newValue }
  }
}

// MARK: - Root

/// A modal decision that requires an explicit action or cancellation.
///
/// `SCAlertDialog` owns native overlay presentation, replacing the web-only
/// Portal and Backdrop plumbing while preserving Trigger and Content slots.
public struct SCAlertDialog<Trigger: View, DialogContent: View>: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @Binding private var isPresented: Bool

  private let trigger: Trigger
  private let dialogContent: DialogContent

  public init(
    isPresented: Binding<Bool>,
    @ViewBuilder trigger: () -> Trigger,
    @ViewBuilder content: () -> DialogContent
  ) {
    _isPresented = isPresented
    self.trigger = trigger()
    dialogContent = content()
  }

  public var body: some View {
    ZStack {
      trigger
        .allowsHitTesting(!isPresented)
        .accessibilityHidden(isPresented)

      if isPresented {
        SCAlertDialogOverlay()
        dialogContent
          .accessibilityAddTraits(.isModal)
          .transition(.scale(scale: 0.95).combined(with: .opacity))
          .background {
            // Upstream's alert dialog dismisses on Escape (while
            // still refusing outside-click dismissal); a hidden
            // cancel-action button is the focus-independent way to
            // bind Escape for the whole key window.
            Button("") { isPresented = false }
              .keyboardShortcut(.cancelAction)
              .opacity(0)
              .accessibilityHidden(true)
          }
      }
    }
    .environment(
      \.scAlertDialogPresentation,
      SCAlertDialogPresentation(isPresented: $isPresented)
    )
    .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: isPresented)
  }
}

// MARK: - Trigger

/// Opens the enclosing `SCAlertDialog`.
public struct SCAlertDialogTrigger<Label: View>: View {
  @Environment(\.scAlertDialogPresentation) private var presentation

  private let label: Label

  public init(@ViewBuilder label: () -> Label) {
    self.label = label()
  }

  public var body: some View {
    Button(action: presentation.present) {
      label
    }
  }
}

extension SCAlertDialogTrigger where Label == Text {
  public init(_ title: String) {
    self.init { Text(title) }
  }
}

// MARK: - Overlay

/// The non-dismissible scrim behind an alert dialog.
public struct SCAlertDialogOverlay: View {
  public init() {}

  public var body: some View {
    Color.black.opacity(0.5)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .ignoresSafeArea()
      .accessibilityHidden(true)
  }
}

// MARK: - Content

/// The centered alert-dialog surface.
public struct SCAlertDialogContent<Content: View>: View {
  @Environment(\.theme) private var theme

  private let size: SCAlertDialogSize
  private let content: Content

  public init(
    size: SCAlertDialogSize = .default,
    @ViewBuilder content: () -> Content
  ) {
    self.size = size
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: size == .small ? .center : .leading, spacing: 16) {
      content
    }
    .padding(24)
    .frame(maxWidth: maxWidth, alignment: size == .small ? .center : .leading)
    .background {
      shape
        .fill(theme.background)
        .shadow(radius: 20, y: 8)
    }
    .overlay { shape.strokeBorder(theme.border) }
    .foregroundStyle(theme.foreground)
    .padding(24)
  }

  private var maxWidth: CGFloat {
    size == .small ? 340 : 420
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius + 2, style: .continuous)
  }
}

// MARK: - Header and footer

public struct SCAlertDialogHeader<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

public struct SCAlertDialogFooter<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        content
      }
      VStack(spacing: 8) {
        content
      }
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
  }
}

// MARK: - Media, title, and description

public struct SCAlertDialogMedia<Content: View>: View {
  @Environment(\.theme) private var theme

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .frame(width: 40, height: 40)
      .background(theme.muted, in: Circle())
      .accessibilityElement(children: .combine)
  }
}

public struct SCAlertDialogTitle<Content: View>: View {
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

extension SCAlertDialogTitle where Content == Text {
  public init(_ title: String) {
    self.init { Text(title) }
  }
}

public struct SCAlertDialogDescription<Content: View>: View {
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

extension SCAlertDialogDescription where Content == Text {
  public init(_ description: String) {
    self.init { Text(description) }
  }
}

// MARK: - Actions

public struct SCAlertDialogAction<Label: View>: View {
  @Environment(\.scAlertDialogPresentation) private var presentation

  private let role: SCAlertDialogRole
  private let isDisabled: Bool
  private let action: () -> Void
  private let label: Label

  public init(
    role: SCAlertDialogRole = .default,
    isDisabled: Bool = false,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) {
    self.role = role
    self.isDisabled = isDisabled
    self.action = action
    self.label = label()
  }

  public var body: some View {
    Button(role: role == .destructive ? .destructive : nil) {
      presentation.dismiss()
      action()
    } label: {
      label
    }
    .buttonStyle(.sc(role == .destructive ? .destructive : .default))
    .disabled(isDisabled)
  }
}

extension SCAlertDialogAction where Label == Text {
  public init(
    _ title: String,
    role: SCAlertDialogRole = .default,
    isDisabled: Bool = false,
    action: @escaping () -> Void
  ) {
    self.init(role: role, isDisabled: isDisabled, action: action) {
      Text(title)
    }
  }
}

public struct SCAlertDialogCancel<Label: View>: View {
  @Environment(\.scAlertDialogPresentation) private var presentation

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
    .buttonStyle(.sc(.outline))
  }
}

extension SCAlertDialogCancel where Label == Text {
  public init(_ title: String = "Cancel", action: @escaping () -> Void = {}) {
    self.init(action: action) { Text(title) }
  }
}
