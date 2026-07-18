// ============================================================
// InputGroupContext.swift — swiftcn-ui
// Shared by: Input.swift · InputGroup.swift · Textarea.swift
// ============================================================
import SwiftUI

/// Internal coordination shared by standalone inputs and the compound Input
/// Group surface. This lives in its own registry item so Input and Textarea can
/// remain independently installable without a circular Input Group dependency.
struct SCInputGroupControlContext: Sendable {
  var isGrouped = false
  var focusRequestID = 0
  var requestFocus: @MainActor @Sendable () -> Void = {}
  var reportFocus: @MainActor @Sendable (Bool) -> Void = { _ in }
}

private struct SCInputGroupControlContextKey: EnvironmentKey {
  static let defaultValue = SCInputGroupControlContext()
}

extension EnvironmentValues {
  var scInputGroupControl: SCInputGroupControlContext {
    get { self[SCInputGroupControlContextKey.self] }
    set { self[SCInputGroupControlContextKey.self] = newValue }
  }
}

struct SCInputGroupInvalidPreferenceKey: PreferenceKey {
  static let defaultValue = false

  static func reduce(value: inout Bool, nextValue: () -> Bool) {
    value = value || nextValue()
  }
}
