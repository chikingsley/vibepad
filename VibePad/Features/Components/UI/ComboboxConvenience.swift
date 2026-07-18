import SwiftUI

// MARK: - Convenience

extension SCCombobox where Value == String {
  /// Convenience for plain string choices — each string is both value and
  /// label.
  ///
  ///     SCCombobox(selection: $framework, options: ["Next.js", "Remix"])
  public init(
    selection: Binding<String?>,
    options: [String],
    placeholder: String = "Select…",
    searchPlaceholder: String = "Search…"
  ) {
    self.init(
      selection: selection,
      options: options.map { SCComboboxOption(value: $0, label: $0) },
      placeholder: placeholder,
      searchPlaceholder: searchPlaceholder
    )
  }

  /// Multi-select convenience for plain string choices.
  public init(
    selection: Binding<Set<String>>,
    options: [String],
    placeholder: String = "Select…",
    searchPlaceholder: String = "Search…",
    showsClearButton: Bool = true
  ) {
    self.init(
      selection: selection,
      options: options.map { SCComboboxOption(value: $0, label: $0) },
      placeholder: placeholder,
      searchPlaceholder: searchPlaceholder,
      showsClearButton: showsClearButton
    )
  }
}
