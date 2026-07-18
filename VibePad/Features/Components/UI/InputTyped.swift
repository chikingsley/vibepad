// ============================================================
// InputTyped.swift — swiftcn-ui
// Supplemental source for: input
// ============================================================
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Date and time inputs

public enum SCDateTimeInputMode: Hashable, Sendable {
  case date
  case time

  fileprivate var displayedComponents: DatePickerComponents {
    switch self {
    case .date: .date
    case .time: .hourAndMinute
    }
  }
}

/// The shared typed engine for native date and time inputs.
public struct SCDateTimeInput: View {
  @Environment(\.scFieldInvalid) private var fieldIsInvalid
  @FocusState private var isFocused: Bool

  @Binding private var value: Date
  private let label: String
  private let mode: SCDateTimeInputMode
  private let range: ClosedRange<Date>?
  private let size: SCInputSize
  private let explicitIsInvalid: SCFieldInvalidState

  public init(
    _ label: String,
    value: Binding<Date>,
    mode: SCDateTimeInputMode,
    in range: ClosedRange<Date>? = nil,
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited
  ) {
    self.label = label
    self._value = value
    self.mode = mode
    self.range = range
    self.size = size
    self.explicitIsInvalid = isInvalid
  }

  @ViewBuilder
  public var body: some View {
    Group {
      if let range {
        DatePicker(
          label,
          selection: $value,
          in: range,
          displayedComponents: mode.displayedComponents
        )
      } else {
        DatePicker(
          label,
          selection: $value,
          displayedComponents: mode.displayedComponents
        )
      }
    }
    .labelsHidden()
    .datePickerStyle(.compact)
    .focused($isFocused)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityLabel(Text(label))
    .modifier(
      SCInputChrome(
        size: size,
        isFocused: isFocused,
        isInvalid: explicitIsInvalid.resolve(inherited: fieldIsInvalid)
      )
    )
  }
}

/// A typed native date input sharing `SCInput` chrome and invalid state.
public struct SCDateInput: View {
  private let input: SCDateTimeInput

  public init(
    _ label: String = "Date",
    value: Binding<Date>,
    in range: ClosedRange<Date>? = nil,
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited
  ) {
    self.input = SCDateTimeInput(
      label,
      value: value,
      mode: .date,
      in: range,
      size: size,
      isInvalid: isInvalid
    )
  }

  public var body: some View { input }
}

/// A typed native time input sharing `SCInput` chrome and invalid state.
public struct SCTimeInput: View {
  private let input: SCDateTimeInput

  public init(
    _ label: String = "Time",
    value: Binding<Date>,
    in range: ClosedRange<Date>? = nil,
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited
  ) {
    self.input = SCDateTimeInput(
      label,
      value: value,
      mode: .time,
      in: range,
      size: size,
      isInvalid: isInvalid
    )
  }

  public var body: some View { input }
}

// MARK: - File input

/// A real native file input backed by `fileImporter`.
public struct SCFileInput: View {
  @Environment(\.theme) private var theme
  @Environment(\.scFieldInvalid) private var fieldIsInvalid
  @FocusState private var isFocused: Bool

  private let selection: Binding<[URL]>
  private let label: String
  private let allowedContentTypes: [UTType]
  private let allowsMultipleSelection: Bool
  private let size: SCInputSize
  private let explicitIsInvalid: SCFieldInvalidState
  private let onSelection: (([URL]) -> Void)?
  private let onError: ((Error) -> Void)?

  @State private var isImporterPresented = false

  public init(
    _ label: String = "Choose File",
    selection: Binding<[URL]>,
    allowedContentTypes: [UTType] = [.item],
    allowsMultipleSelection: Bool = false,
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited,
    onSelection: (([URL]) -> Void)? = nil,
    onError: ((Error) -> Void)? = nil
  ) {
    self.label = label
    self.selection = selection
    self.allowedContentTypes = allowedContentTypes.isEmpty ? [.item] : allowedContentTypes
    self.allowsMultipleSelection = allowsMultipleSelection
    self.size = size
    self.explicitIsInvalid = isInvalid
    self.onSelection = onSelection
    self.onError = onError
  }

  public init(
    _ label: String = "Choose File",
    selection: Binding<URL?>,
    allowedContentTypes: [UTType] = [.item],
    size: SCInputSize = .default,
    isInvalid: SCFieldInvalidState = .inherited,
    onSelection: ((URL?) -> Void)? = nil,
    onError: ((Error) -> Void)? = nil
  ) {
    self.init(
      label,
      selection: Binding(
        get: { selection.wrappedValue.map { [$0] } ?? [] },
        set: {
          selection.wrappedValue = $0.first
          onSelection?($0.first)
        }
      ),
      allowedContentTypes: allowedContentTypes,
      allowsMultipleSelection: false,
      size: size,
      isInvalid: isInvalid,
      onError: onError
    )
  }

  public var body: some View {
    Button {
      isImporterPresented = true
    } label: {
      HStack(spacing: 8) {
        Image(systemName: "doc")
          .foregroundStyle(theme.mutedForeground)
          .accessibilityHidden(true)
        Text(selectionDescription)
          .lineLimit(1)
          .foregroundStyle(
            selection.wrappedValue.isEmpty ? theme.mutedForeground : theme.foreground)
        Spacer(minLength: 8)
        Text(label)
          .font(.caption.weight(.medium))
          .foregroundStyle(theme.foreground)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .focused($isFocused)
    .accessibilityLabel(Text(label))
    .accessibilityValue(Text(selectionDescription))
    .modifier(
      SCInputChrome(
        size: size,
        isFocused: isFocused,
        isInvalid: explicitIsInvalid.resolve(inherited: fieldIsInvalid)
      )
    )
    .fileImporter(
      isPresented: $isImporterPresented,
      allowedContentTypes: allowedContentTypes,
      allowsMultipleSelection: allowsMultipleSelection
    ) { result in
      switch result {
      case .success(let urls):
        selection.wrappedValue = urls
        onSelection?(urls)
      case .failure(let error):
        onError?(error)
      }
    }
  }

  private var selectionDescription: String {
    switch selection.wrappedValue.count {
    case 0: "No file selected"
    case 1: selection.wrappedValue[0].lastPathComponent
    default: "\(selection.wrappedValue.count) files selected"
    }
  }
}
