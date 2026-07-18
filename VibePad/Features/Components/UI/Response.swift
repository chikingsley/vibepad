// ============================================================
// Response.swift — swiftcn-ui
// Depends on: Theme/
//
// PACKAGE DEPENDENCY — MarkdownUI. This file is the library's one
// component built on an SPM package, mirroring upstream's registry
// item declaring the `streamdown` npm package. Consumers vendoring
// this file must add MarkdownUI themselves:
//
//     .package(url: "https://github.com/gonzalezreal/swift-markdown-ui",
//              from: "2.4.1")
//
// and depend on its "MarkdownUI" product (ported against 2.4.1).
//
// SwiftUI port of elevenlabs-ui's `Response`: a thin, memoized
// wrapper around a markdown rendering engine. Upstream part:
// Response (React.memo around Streamdown).
//
// Intentional adaptations:
// - MarkdownUI's `Markdown` view replaces Streamdown, which is
//   JS-only. Known gap, watched: MarkdownUI has no streaming-aware
//   rendering of incomplete markdown — an unterminated code fence
//   or emphasis renders literally until the closing delimiter
//   streams in, where Streamdown renders it as already complete.
// - `Equatable` conformance keyed on the markdown string replaces
//   `React.memo` and its children comparator: SwiftUI skips the
//   body when a parent re-creates an equal value.
// - MarkdownUI applies block margins only between blocks — the
//   first block gets no top margin and the last block's bottom
//   margin is never emitted — which is upstream's
//   `[&>*:first-child]:mt-0 [&>*:last-child]:mb-0` by construction.
// - Upstream's `size-full` becomes a leading full-width frame;
//   height stays natural so the view composes inside ScrollView
//   and chat rows.
// ============================================================
import MarkdownUI
import SwiftUI

// MARK: - Component

/// Renders a markdown string with theme-token styling — the swiftcn port of
/// elevenlabs-ui's Response, wrapping MarkdownUI the way upstream wraps
/// Streamdown.
///
///     SCResponse("**Hello!** How can I help you today?")
///     SCResponse(message.markdown)  // headings, lists, code, tables, …
public struct SCResponse: View, Equatable {
  @Environment(\.theme) private var theme

  var markdown: String

  /// Creates a response from a markdown string — upstream's `children`.
  public init(_ markdown: String) {
    self.markdown = markdown
  }

  public var body: some View {
    Markdown(markdown)
      .markdownTheme(Self.markdownTheme(theme))
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// Re-render only when the markdown changes — upstream's memo comparator
  /// (`prevProps.children === nextProps.children`).
  nonisolated public static func == (lhs: SCResponse, rhs: SCResponse) -> Bool {
    lhs.markdown == rhs.markdown
  }
}

// MARK: - Markdown theme

// Maps swiftcn theme tokens onto MarkdownUI's theming API, kept minimal:
// - body text and headings sit on `theme.foreground`;
// - inline code and code-block surfaces sit on `theme.muted`;
// - table lines, the blockquote rule, code-block borders, and horizontal
//   rules use `theme.border`;
// - links use `theme.primary`, matching shadcn's typography link color;
// - font sizes are relative (em) so the response inherits the caller's font.
extension SCResponse {
  private static func markdownTheme(_ theme: Theme) -> MarkdownUI.Theme {
    var markdown = MarkdownUI.Theme()
      .text {
        ForegroundColor(theme.foreground)
      }
      .code {
        FontFamilyVariant(.monospaced)
        FontSize(.em(0.85))
        BackgroundColor(theme.muted)
      }
      .link {
        ForegroundColor(theme.primary)
        UnderlineStyle(.single)
      }
    markdown = headingStyles(for: markdown, theme: theme)
    markdown = textBlockStyles(for: markdown, theme: theme)
    markdown = containerBlockStyles(for: markdown, theme: theme)
    return markdown
  }

  /// The shadcn heading scale (h1 bold, h2–h6 semibold, shrinking em sizes).
  private static func headingStyles(
    for markdown: MarkdownUI.Theme,
    theme: Theme
  ) -> MarkdownUI.Theme {
    markdown
      .heading1 { configuration in
        configuration.label
          .markdownMargin(top: 24, bottom: 16)
          .markdownTextStyle {
            FontWeight(.bold)
            FontSize(.em(2))
          }
      }
      .heading2 { configuration in
        configuration.label
          .markdownMargin(top: 24, bottom: 16)
          .markdownTextStyle {
            FontWeight(.semibold)
            FontSize(.em(1.5))
          }
      }
      .heading3 { configuration in
        configuration.label
          .markdownMargin(top: 24, bottom: 16)
          .markdownTextStyle {
            FontWeight(.semibold)
            FontSize(.em(1.25))
          }
      }
      .heading4 { configuration in
        configuration.label
          .markdownMargin(top: 24, bottom: 16)
          .markdownTextStyle {
            FontWeight(.semibold)
          }
      }
      .heading5 { configuration in
        configuration.label
          .markdownMargin(top: 24, bottom: 16)
          .markdownTextStyle {
            FontWeight(.semibold)
            FontSize(.em(0.875))
          }
      }
      .heading6 { configuration in
        configuration.label
          .markdownMargin(top: 24, bottom: 16)
          .markdownTextStyle {
            FontWeight(.semibold)
            FontSize(.em(0.85))
            ForegroundColor(theme.mutedForeground)
          }
      }
  }

  /// Paragraphs, blockquotes, and list items.
  private static func textBlockStyles(
    for markdown: MarkdownUI.Theme,
    theme: Theme
  ) -> MarkdownUI.Theme {
    markdown
      .paragraph { configuration in
        configuration.label
          .fixedSize(horizontal: false, vertical: true)
          .relativeLineSpacing(.em(0.25))
          .markdownMargin(top: 0, bottom: 16)
      }
      .blockquote { configuration in
        HStack(spacing: 0) {
          RoundedRectangle(cornerRadius: 1)
            .fill(theme.border)
            .frame(width: 2)
          configuration.label
            .markdownTextStyle {
              FontStyle(.italic)
            }
            .relativePadding(.horizontal, length: .em(1))
        }
        .fixedSize(horizontal: false, vertical: true)
      }
      .listItem { configuration in
        configuration.label
          .markdownMargin(top: .em(0.25))
      }
  }

  /// Code blocks, tables, and horizontal rules — the bordered surfaces.
  private static func containerBlockStyles(
    for markdown: MarkdownUI.Theme,
    theme: Theme
  ) -> MarkdownUI.Theme {
    let surface = RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
    return
      markdown
      .codeBlock { configuration in
        ScrollView(.horizontal) {
          configuration.label
            .fixedSize(horizontal: false, vertical: true)
            .relativeLineSpacing(.em(0.225))
            .markdownTextStyle {
              FontFamilyVariant(.monospaced)
              FontSize(.em(0.85))
            }
            .padding(12)
        }
        .background(theme.muted)
        .clipShape(surface)
        .overlay(surface.strokeBorder(theme.border))
        .markdownMargin(top: 0, bottom: 16)
      }
      .table { configuration in
        configuration.label
          .fixedSize(horizontal: false, vertical: true)
          .markdownTableBorderStyle(.init(color: theme.border))
          .markdownTableBackgroundStyle(.alternatingRows(Color.clear, theme.muted))
          .markdownMargin(top: 0, bottom: 16)
      }
      .tableCell { configuration in
        configuration.label
          .markdownTextStyle {
            if configuration.row == 0 {
              FontWeight(.semibold)
            }
          }
          .fixedSize(horizontal: false, vertical: true)
          .padding(.vertical, 6)
          .padding(.horizontal, 12)
          .relativeLineSpacing(.em(0.25))
      }
      .thematicBreak {
        Divider()
          .overlay(theme.border)
          .markdownMargin(top: 24, bottom: 24)
      }
  }
}
