import Foundation

/// Pure composer input rules retained independently of any UIKit or SwiftUI text view.
nonisolated enum ChatComposerKeyAction: Equatable, Sendable {
  case system
  case insertNewline
  case submit

  static func action(
    for replacementText: String,
    hasMarkedText: Bool,
    isShiftReturn _: Bool
  ) -> ChatComposerKeyAction {
    guard replacementText == "\n", !hasMarkedText else { return .system }
    return .insertNewline
  }
}

nonisolated enum ChatComposerSendGate {
  static func canSend(text: String, isSending: Bool, hasMarkedText: Bool) -> Bool {
    guard !isSending, !hasMarkedText else { return false }
    return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}
