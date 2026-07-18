// ============================================================
// Input.swift — swiftcn-ui
// Depends on: Theme/ · Field.swift (reads \.scFieldInvalid)
// ============================================================
import SwiftUI

// MARK: - InputConvertible

/// A value that can round-trip through the text of an `SCInput`.
///
/// `String`, `Int`, and `Double` conform out of the box, letting `SCInput`
/// edit numbers directly (with the matching keyboard on iOS):
///
///     SCInput("Age", value: $age)      // Int    → .numberPad
///     SCInput("Price", value: $price)  // Double → .decimalPad
public protocol InputConvertible: CustomStringConvertible {
  /// Creates a value from user-typed text. Return `nil` to reject the text —
  /// the previous value is kept while the user keeps typing.
  init?(_ description: String)
}

extension String: InputConvertible {}
extension Int: InputConvertible {}
extension Double: InputConvertible {}

// MARK: - Component

public enum SCInputSize: CaseIterable, Sendable {
  case `default`, sm
}

/// The semantic intent of a text-based input. Date, time, and file values use
/// `SCDateInput`, `SCTimeInput`, and `SCFileInput` so their bindings stay typed.
public enum SCInputKind: Hashable, Sendable {
  case automatic
  case text
  case email
  case password
  case telephone
  case url
  case search
  case number
}

/// A themed single-line text field — shadcn's Input on a native `TextField`.
///
/// Anatomy: optional leading SF Symbol icon, the text field, and an optional
/// trailing slot. The border uses `theme.input`, switching to `theme.ring`
/// while focused and `theme.destructive` inside an `SCField` with an error.
///
///     SCInput("Email", text: $email, icon: "envelope")
///     SCInput("Password", text: $password, secure: true)
///     SCInput("Age", value: $age)
///     SCInput("Search", text: $query) {
///         Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
///             .buttonStyle(.plain)
///     }
public struct SCInput<Value: InputConvertible, Trailing: View>: View {
  @Environment(\.theme) private var theme
  @Environment(\.scFieldInvalid) private var fieldIsInvalid
  @Environment(\.scInputGroupControl) private var inputGroupControl
  @FocusState private var isFocused: Bool

  @Binding private var value: Value
  private let placeholder: String
  private let icon: String?
  private let kind: SCInputKind
  private let size: SCInputSize
  private let explicitIsInvalid: SCFieldInvalidState
  private let onSubmit: (() -> Void)?
  private let trailing: Trailing

  /// Text mirror of `value` so partial entries ("1." while typing 1.5)
  /// aren't reformatted mid-keystroke.
  @State private var text: String
  /// Whether a secure input is temporarily showing its text.
  @State private var isRevealed = false

  /// Creates an input bound to any `InputConvertible` value, with a
  /// trailing accessory slot.
  public init(
    _ placeholder: String,
    value: Binding<Value>,
    icon: String? = nil,
    secure: Bool = false,
    kind: SCInputKind = .automatic,
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited,
    onSubmit: (() -> Void)? = nil,
    @ViewBuilder trailing: () -> Trailing
  ) {
    self.placeholder = placeholder
    self._value = value
    self.icon = icon
    self.kind = secure ? .password : kind
    self.size = size
    self.explicitIsInvalid = isInvalid
    self.onSubmit = onSubmit
    self.trailing = trailing()
    self._text = State(initialValue: value.wrappedValue.description)
  }

  public var body: some View {
    HStack(spacing: 8) {
      if let icon {
        Image(systemName: icon)
          .font(.subheadline)
          .foregroundStyle(theme.mutedForeground)
      }

      field

      if resolvedKind == .password {
        Button {
          isRevealed.toggle()
        } label: {
          Image(systemName: isRevealed ? "eye.slash" : "eye")
            .font(.subheadline)
        }
        .buttonStyle(.plain)
        .foregroundStyle(theme.mutedForeground)
        .accessibilityLabel(isRevealed ? "Hide password" : "Show password")
      }

      trailing
        .foregroundStyle(theme.mutedForeground)
    }
    .modifier(
      SCInputChrome(
        size: size,
        isFocused: isFocused,
        isInvalid: resolvedIsInvalid,
        suppressesChrome: inputGroupControl.isGrouped
      )
    )
    // The web input announces invalidity through aria-invalid; a hint is
    // the native equivalent, matching SCSwitch.
    .accessibilityHint(resolvedIsInvalid ? "Invalid entry" : "")
    .onTapGesture { isFocused = true }
    .animation(.easeOut(duration: 0.15), value: isFocused)
    .onChange(of: text) { _, newText in
      if let parsed = Value(newText) {
        value = parsed
      }
    }
    .onChange(of: value.description) { _, newDescription in
      // External binding change — don't clobber equivalent in-progress text.
      if Value(text)?.description != newDescription {
        text = newDescription
      }
    }
    .onSubmit { onSubmit?() }
    .onChange(of: isFocused) { _, focused in
      inputGroupControl.reportFocus(focused)
    }
    .onChange(of: inputGroupControl.focusRequestID) { _, _ in
      guard inputGroupControl.isGrouped else { return }
      isFocused = true
    }
    .preference(
      key: SCInputGroupInvalidPreferenceKey.self,
      value: inputGroupControl.isGrouped && resolvedIsInvalid
    )
    .onDisappear {
      if isFocused {
        inputGroupControl.reportFocus(false)
      }
    }
  }

  private var field: some View {
    Group {
      if resolvedKind == .password && !isRevealed {
        SecureField(placeholder, text: $text, prompt: prompt)
          #if os(iOS)
            .textContentType(.password)
          #endif
      } else {
        TextField(placeholder, text: $text, prompt: prompt)
          #if os(iOS)
            .keyboardType(keyboardType)
          #endif
      }
    }
    .textFieldStyle(.plain)
    .font(.system(size: 14))
    .foregroundStyle(theme.foreground)
    .focused($isFocused)
    .modifier(SCInputTextIntentModifier(kind: resolvedKind))
    #if os(iOS)
      .textContentType(textContentType)
    #endif
  }

  private var prompt: Text {
    Text(placeholder).foregroundStyle(theme.mutedForeground)
  }

  private var resolvedKind: SCInputKind {
    guard kind == .automatic else { return kind }
    if Value.self == Int.self || Value.self == Double.self {
      return .number
    }
    return .text
  }

  private var resolvedIsInvalid: Bool {
    explicitIsInvalid.resolve(inherited: fieldIsInvalid)
  }

  #if os(iOS)
    private var textContentType: UITextContentType? {
      switch resolvedKind {
      case .email: .emailAddress
      case .password: .password
      case .telephone: .telephoneNumber
      case .url: .URL
      default: nil
      }
    }

    private var keyboardType: UIKeyboardType {
      switch resolvedKind {
      case .email: .emailAddress
      case .telephone: .phonePad
      case .url: .URL
      case .search: .webSearch
      case .number:
        Value.self == Int.self ? .numberPad : .decimalPad
      default: .default
      }
    }
  #endif
}

private struct SCInputTextIntentModifier: ViewModifier {
  let kind: SCInputKind

  @ViewBuilder
  func body(content: Content) -> some View {
    #if os(iOS)
      switch kind {
      case .email, .password, .telephone, .url:
        content
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      case .search:
        content.submitLabel(.search)
      default:
        content
      }
    #else
      content
    #endif
  }
}

// MARK: - Shared chrome

struct SCInputChrome: ViewModifier {
  @Environment(\.theme) private var theme
  @Environment(\.isEnabled) private var isEnabled
  @Environment(\.scGroupedControlOrientation) private var groupOrientation

  let size: SCInputSize
  let isFocused: Bool
  let isInvalid: Bool
  var suppressesChrome = false

  @ViewBuilder
  func body(content: Content) -> some View {
    if suppressesChrome {
      content
        .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      content
        .padding(.horizontal, 12)
        .frame(height: size == .sm ? 32 : 40)
        .background(theme.background, in: shape)
        // The border is decorative: without this it hit-tests in front
        // of the field's own controls and swallows their actions.
        .overlay(
          shape.strokeBorder(strokeColor, lineWidth: isFocused ? 1.5 : 1)
            .allowsHitTesting(false)
        )
        .contentShape(shape)
        .opacity(isEnabled ? 1 : 0.5)
    }
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(
      cornerRadius: groupOrientation == nil ? theme.radius : 0,
      style: .continuous
    )
  }

  private var strokeColor: Color {
    if isInvalid {
      theme.destructive
    } else if isFocused {
      theme.ring
    } else {
      theme.input
    }
  }
}

// MARK: - Convenience initializers

extension SCInput where Trailing == EmptyView {
  /// Creates an input bound to any `InputConvertible` value.
  public init(
    _ placeholder: String,
    value: Binding<Value>,
    icon: String? = nil,
    kind: SCInputKind = .automatic,
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited,
    onSubmit: (() -> Void)? = nil
  ) {
    self.init(
      placeholder,
      value: value,
      icon: icon,
      kind: kind,
      size: size,
      isInvalid: isInvalid,
      onSubmit: onSubmit
    ) { EmptyView() }
  }
}

extension SCInput where Value == String, Trailing == EmptyView {
  /// Creates a plain text input — the primary form. Pass `secure: true` for
  /// a password field with a built-in reveal toggle.
  ///
  ///     SCInput("Email", text: $email, icon: "envelope")
  ///     SCInput("Password", text: $password, secure: true)
  public init(
    _ placeholder: String,
    text: Binding<String>,
    icon: String? = nil,
    secure: Bool = false,
    kind: SCInputKind = .automatic,
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited,
    onSubmit: (() -> Void)? = nil
  ) {
    self.init(
      placeholder,
      value: text,
      icon: icon,
      secure: secure,
      kind: kind,
      size: size,
      isInvalid: isInvalid,
      onSubmit: onSubmit
    ) { EmptyView() }
  }
}

extension SCInput where Value == String {
  /// Creates a plain text input with a trailing accessory slot.
  public init(
    _ placeholder: String,
    text: Binding<String>,
    icon: String? = nil,
    secure: Bool = false,
    kind: SCInputKind = .automatic,
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited,
    onSubmit: (() -> Void)? = nil,
    @ViewBuilder trailing: () -> Trailing
  ) {
    self.init(
      placeholder,
      value: text,
      icon: icon,
      secure: secure,
      kind: kind,
      size: size,
      isInvalid: isInvalid,
      onSubmit: onSubmit,
      trailing: trailing
    )
  }
}
