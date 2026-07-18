// ============================================================
// FieldInvalidState.swift — swiftcn-ui
// Supplemental source for: field
// ============================================================

/// Resolves whether a form control is invalid on its own or inherits that
/// state from the surrounding `SCField`.
public enum SCFieldInvalidState: Hashable, Sendable, ExpressibleByBooleanLiteral {
  case inherited
  case valid
  case invalid

  public init(booleanLiteral value: Bool) {
    self = value ? .invalid : .valid
  }

  func resolve(inherited inheritedValue: Bool) -> Bool {
    switch self {
    case .inherited: inheritedValue
    case .valid: false
    case .invalid: true
    }
  }
}
