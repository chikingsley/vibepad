import SwiftUI

#if canImport(UIKit)
  import UIKit
#elseif canImport(AppKit)
  import AppKit
#endif

extension Color {
  /// Extends Apple's `SwiftUI.Color` with one light/dark initializer.
  ///
  /// This is swiftcn's replacement for selecting between shadcn's `:root`
  /// and `.dark` variable values. Components never branch on `colorScheme`;
  /// the semantic color stored in `Theme` resolves through the platform's
  /// native appearance system.
  public init(light: Color, dark: Color) {
    #if canImport(UIKit)
      self.init(
        uiColor: UIColor { trait in
          trait.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    #elseif canImport(AppKit)
      self.init(
        nsColor: NSColor(name: nil) { appearance in
          let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
          return isDark ? NSColor(dark) : NSColor(light)
        })
    #else
      self = light
    #endif
  }
}
