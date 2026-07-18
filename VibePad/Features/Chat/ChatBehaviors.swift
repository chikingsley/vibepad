import SwiftUI

/// Edge-swipe gesture for opening the session list. We only accept
/// horizontal swipes starting near the left edge — keeps the chat
/// pan / scroll gestures responsive in the rest of the view.
nonisolated enum SessionListEdgeSwipeBehavior {
  static let edgeThreshold: CGFloat = 32
  static let minimumHorizontalTranslation: CGFloat = 72
  static let maximumVerticalTranslation: CGFloat = 56

  static func shouldOpenSessionList(startLocation: CGPoint, translation: CGSize) -> Bool {
    guard startLocation.x <= edgeThreshold else { return false }
    guard translation.width >= minimumHorizontalTranslation else { return false }
    return abs(translation.height) <= maximumVerticalTranslation
  }
}
