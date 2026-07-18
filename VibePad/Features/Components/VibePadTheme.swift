import SwiftUI

extension Theme {
  static let vibePad: Theme = {
    var theme = Theme.default
    theme.primary = DesignColors.Brand.primary
    theme.primaryForeground = .white
    theme.ring = DesignColors.Brand.primary
    theme.sidebarPrimary = DesignColors.Brand.primary
    theme.sidebarPrimaryForeground = .white
    theme.sidebarRing = DesignColors.Brand.primary
    return theme
  }()
}
