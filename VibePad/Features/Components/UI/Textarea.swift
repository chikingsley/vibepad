// ============================================================
// Textarea.swift — swiftcn-ui
// Depends on: Theme/ · Field.swift (reads \.scFieldInvalid)
// ============================================================
import SwiftUI

// MARK: - Component

/// A themed multi-line text area — shadcn's Textarea on a native `TextEditor`.
///
/// Shares `SCInput`'s border treatment: `theme.input` at rest, `theme.ring`
/// while focused, and `theme.destructive` inside an `SCField` with an error.
/// Shows a muted placeholder while empty.
///
///     SCTextarea("Type your message here.", text: $message)
///     SCTextarea("Bio", text: $bio, minHeight: 140)
public struct SCTextarea: View {
  @Environment(\.theme) private var theme
  @Environment(\.scFieldInvalid) private var fieldIsInvalid
  @Environment(\.scInputGroupControl) private var inputGroupControl
  @FocusState private var isFocused: Bool

  @Binding private var text: String
  private let placeholder: String
  private let minHeight: CGFloat
  private let explicitIsInvalid: SCFieldInvalidState

  /// Creates a text area.
  /// - Parameters:
  ///   - placeholder: Muted text shown while `text` is empty.
  ///   - text: The edited string.
  ///   - minHeight: Minimum editor height in points (grows with content).
  public init(
    _ placeholder: String = "",
    text: Binding<String>,
    minHeight: CGFloat = 64,
    isInvalid: SCFieldInvalidState = .inherited
  ) {
    self.placeholder = placeholder
    self._text = text
    self.minHeight = max(minHeight, 0)
    self.explicitIsInvalid = isInvalid
  }

  public var body: some View {
    ZStack(alignment: .topLeading) {
      TextEditor(text: $text)
        .font(.subheadline)
        .foregroundStyle(theme.foreground)
        .scrollContentBackground(.hidden)
        .focused($isFocused)
        .frame(minHeight: minHeight, alignment: .topLeading)
        .accessibilityHint(accessibilityHint)

      if text.isEmpty {
        Text(placeholder)
          .font(.subheadline)
          .foregroundStyle(theme.mutedForeground)
          .padding(editorTextInsets)
          .allowsHitTesting(false)
          .accessibilityHidden(true)
      }
    }
    .modifier(
      SCTextareaChrome(
        contentPadding: contentPadding,
        isFocused: isFocused,
        isInvalid: resolvedIsInvalid,
        suppressesChrome: inputGroupControl.isGrouped
      )
    )
    .onTapGesture { isFocused = true }
    .animation(.easeOut(duration: 0.15), value: isFocused)
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

  private var resolvedIsInvalid: Bool {
    explicitIsInvalid.resolve(inherited: fieldIsInvalid)
  }

  /// The web textarea announces invalidity through aria-invalid; a hint is
  /// the native equivalent, matching SCSwitch. The placeholder hint is
  /// preserved because the visible placeholder is hidden from accessibility.
  private var accessibilityHint: String {
    let placeholderHint = text.isEmpty ? placeholder : ""
    guard resolvedIsInvalid else { return placeholderHint }
    return placeholderHint.isEmpty ? "Invalid entry" : "Invalid entry. \(placeholderHint)"
  }

  /// Outer padding, minus `TextEditor`'s intrinsic insets (5pt line-fragment
  /// padding on both platforms; 8pt top inset on iOS only), so the text
  /// sits 12pt from the border like `SCInput`.
  private var contentPadding: EdgeInsets {
    #if os(iOS)
      EdgeInsets(top: 4, leading: 7, bottom: 4, trailing: 7)
    #else
      EdgeInsets(top: 12, leading: 7, bottom: 12, trailing: 7)
    #endif
  }

  /// Aligns the placeholder with `TextEditor`'s intrinsic text origin.
  private var editorTextInsets: EdgeInsets {
    #if os(iOS)
      EdgeInsets(top: 8, leading: 5, bottom: 0, trailing: 0)
    #else
      EdgeInsets(top: 0, leading: 5, bottom: 0, trailing: 0)
    #endif
  }
}

private struct SCTextareaChrome: ViewModifier {
  @Environment(\.theme) private var theme
  @Environment(\.isEnabled) private var isEnabled

  let contentPadding: EdgeInsets
  let isFocused: Bool
  let isInvalid: Bool
  let suppressesChrome: Bool

  @ViewBuilder
  func body(content: Content) -> some View {
    if suppressesChrome {
      content
        .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      content
        .padding(contentPadding)
        .background(theme.background, in: shape)
        .overlay(shape.strokeBorder(strokeColor, lineWidth: isFocused ? 1.5 : 1))
        .contentShape(shape)
        .opacity(isEnabled ? 1 : 0.5)
    }
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
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
