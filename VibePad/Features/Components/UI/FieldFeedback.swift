// ============================================================
// FieldFeedback.swift — swiftcn-ui
// Supplemental parts for: Field.swift
// ============================================================
import SwiftUI

// MARK: - Separator

/// A field-group separator with optional centered arbitrary content.
public struct SCFieldSeparator<Content: View>: View {
  @Environment(\.theme) private var theme

  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    ZStack {
      Divider()
      content
        .font(.caption)
        .foregroundStyle(theme.mutedForeground)
        .padding(.horizontal, 8)
        .background(theme.background)
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }
}

extension SCFieldSeparator where Content == EmptyView {
  public init() {
    self.init { EmptyView() }
  }
}

// MARK: - Error

/// Validation feedback. Custom content takes precedence over `errors`; string
/// errors are deduplicated while preserving their first-seen order.
public struct SCFieldError<Content: View>: View {
  @Environment(\.theme) private var theme

  private let errors: [String]
  private let announcement: String?
  private let content: Content

  public init(
    errors: [String] = [],
    announcement: String? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.errors = errors
    self.announcement = announcement
    self.content = content()
  }

  @ViewBuilder
  public var body: some View {
    Group {
      if Content.self != EmptyView.self {
        content
      } else if uniqueErrors.count == 1, let error = uniqueErrors.first {
        Text(error)
      } else if !uniqueErrors.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(uniqueErrors, id: \.self) { error in
            HStack(alignment: .firstTextBaseline, spacing: 6) {
              Text("•")
                .accessibilityHidden(true)
              Text(error)
            }
          }
        }
      }
    }
    .font(.caption)
    .foregroundStyle(theme.destructive)
    .accessibilityElement(children: .combine)
    .onAppear { postAnnouncement(resolvedAnnouncement) }
    .onChange(of: resolvedAnnouncement) { _, message in
      postAnnouncement(message)
    }
  }

  private var uniqueErrors: [String] {
    var seen = Set<String>()
    return
      errors
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty && seen.insert($0).inserted }
  }

  private var resolvedAnnouncement: String {
    announcement ?? uniqueErrors.joined(separator: ", ")
  }

  private func postAnnouncement(_ message: String) {
    guard !message.isEmpty else { return }
    AccessibilityNotification.Announcement(message).post()
  }
}

extension SCFieldError where Content == EmptyView {
  public init(_ error: String) {
    self.init(errors: [error]) { EmptyView() }
  }

  public init(errors: [String]) {
    self.init(errors: errors) { EmptyView() }
  }
}

// MARK: - Compact convenience composition

extension SCField where Content == AnyView {
  /// A compact label/control/description/error initializer composed from the
  /// same public field parts.
  public init<Control: View>(
    _ label: String? = nil,
    required: Bool = false,
    description: String? = nil,
    error: String? = nil,
    isDisabled: Bool = false,
    @ViewBuilder control: () -> Control
  ) {
    let controlView = control()
    self.init(isInvalid: error != nil, isDisabled: isDisabled) {
      AnyView(
        Group {
          if let label {
            SCFieldLabel(label, isRequired: required)
            controlView
              .accessibilityLabel(Text(label))
          } else {
            controlView
          }
          if let error {
            SCFieldError(error)
          } else if let description {
            SCFieldDescription(description)
          }
        }
      )
    }
  }
}
