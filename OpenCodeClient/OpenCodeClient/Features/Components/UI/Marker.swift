// ============================================================
// Marker.swift — swiftcn-ui
// Depends on: Theme/
//
// SwiftUI port of shadcn/ui's Marker (June 2026 chat release):
// status updates, system notes, bordered rows, and labeled
// separators inside a conversation. Upstream parts: Marker ·
// MarkerIcon · MarkerContent. Pair the content with
// `.scShimmer()` for live status, exactly like upstream pairs
// `MarkerContent` with the `shimmer` utility.
//
//     SCMarker {
//         SCMarkerIcon { SCSpinner(size: 16) }
//         SCMarkerContent("Thinking…")
//     }
// ============================================================
import SwiftUI

// MARK: - Variants

/// The layout style of a marker — shadcn's `variant` prop.
public nonisolated enum SCMarkerVariant: Hashable, Sendable {
  /// An inline marker for status and notes.
  case `default`
  /// An inline marker with a bottom border for row separation.
  case border
  /// A centered label between decorative divider lines.
  case separator
}

// MARK: - Marker

/// A conversation marker — shadcn's `Marker`. Renders status updates,
/// system notes, bordered rows, and labeled separators. Upstream's `render`
/// prop (link/button markers) maps to native composition: wrap the marker
/// in a `Button` or `Link` instead.
///
///     SCMarker { SCMarkerContent("Explored 4 files") }
///     SCMarker(variant: .separator) { SCMarkerContent("Today") }
public struct SCMarker<Content: View>: View {
  @Environment(\.theme) private var theme

  var variant: SCMarkerVariant
  @ViewBuilder var content: Content

  /// Creates a marker.
  /// - Parameters:
  ///   - variant: `.default`, `.border`, or `.separator`.
  ///   - content: An optional `SCMarkerIcon` followed by `SCMarkerContent`.
  public init(variant: SCMarkerVariant = .default, @ViewBuilder content: () -> Content) {
    self.variant = variant
    self.content = content()
  }

  public var body: some View {
    row
      .font(.subheadline)
      .foregroundStyle(theme.mutedForeground)
      .frame(minHeight: 16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
  }

  @ViewBuilder private var row: some View {
    switch variant {
    case .default:
      HStack(spacing: 8) {
        content
      }
    case .border:
      VStack(spacing: 0) {
        HStack(spacing: 8) {
          content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 8)
        theme.border
          .frame(height: 1)
          .accessibilityHidden(true)
      }
    case .separator:
      HStack(spacing: 8) {
        hairline
        content
        hairline
      }
    }
  }

  private var hairline: some View {
    theme.border
      .frame(height: 1)
      .frame(maxWidth: .infinity)
      .padding(.horizontal, 4)
      .accessibilityHidden(true)
  }
}

// MARK: - Icon

/// The decorative icon slot of a marker — shadcn's `MarkerIcon`. Hidden
/// from assistive technologies, exactly like upstream's `aria-hidden`.
///
///     SCMarkerIcon { Image(systemName: "checkmark") }
public struct SCMarkerIcon<Content: View>: View {
  @ViewBuilder var content: Content

  /// Creates the icon slot. Put a small image or spinner inside.
  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .font(.caption)
      .frame(width: 16, height: 16)
      .accessibilityHidden(true)
  }
}

// MARK: - Content

/// The text content of a marker — shadcn's `MarkerContent`.
///
///     SCMarkerContent("Running tests")
///     SCMarkerContent { Text("Compacting conversation") }
public struct SCMarkerContent<Content: View>: View {
  @ViewBuilder var content: Content

  /// Creates marker content with arbitrary views.
  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .fixedSize(horizontal: false, vertical: true)
  }
}

extension SCMarkerContent where Content == Text {
  /// Creates text content — the primary form.
  public init(_ text: String) {
    self.init { Text(text) }
  }
}
