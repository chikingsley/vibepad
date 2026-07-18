import SwiftUI

/// The design-token set for swiftcn — the SwiftUI analog of shadcn/ui's CSS
/// variables. Inject it once at the root with `.theme(_:)`; every component
/// reads it via `@Environment(\.theme)`.
///
/// Tokens follow shadcn's background/foreground convention: `x` is a surface
/// color, `xForeground` is the color of content placed on that surface.
/// Dark mode needs no second theme — token colors are adaptive
/// (see `Color(light:dark:)`).
public struct Theme: Sendable {
  // MARK: Base
  public var background: Color
  public var foreground: Color

  // MARK: Surfaces
  public var card: Color
  public var cardForeground: Color
  public var popover: Color
  public var popoverForeground: Color

  // MARK: Semantic pairs
  public var primary: Color
  public var primaryForeground: Color
  public var secondary: Color
  public var secondaryForeground: Color
  public var muted: Color
  public var mutedForeground: Color
  public var accent: Color
  public var accentForeground: Color
  public var destructive: Color
  public var destructiveForeground: Color

  // MARK: Chrome
  public var border: Color
  public var input: Color
  public var ring: Color

  // MARK: Charts
  public var chart1: Color
  public var chart2: Color
  public var chart3: Color
  public var chart4: Color
  public var chart5: Color

  // MARK: Sidebar (independently themeable, mirroring shadcn's --sidebar-* family)
  public var sidebar: Color
  public var sidebarForeground: Color
  public var sidebarPrimary: Color
  public var sidebarPrimaryForeground: Color
  public var sidebarAccent: Color
  public var sidebarAccentForeground: Color
  public var sidebarBorder: Color
  public var sidebarRing: Color

  // MARK: Shape & type
  /// Base corner radius in points (shadcn `--radius: 0.625rem` ≙ 10pt).
  public var radius: CGFloat
  public var fontDesign: Font.Design

  public init(
    background: Color,
    foreground: Color,
    card: Color,
    cardForeground: Color,
    popover: Color,
    popoverForeground: Color,
    primary: Color,
    primaryForeground: Color,
    secondary: Color,
    secondaryForeground: Color,
    muted: Color,
    mutedForeground: Color,
    accent: Color,
    accentForeground: Color,
    destructive: Color,
    destructiveForeground: Color,
    border: Color,
    input: Color,
    ring: Color,
    chart1: Color,
    chart2: Color,
    chart3: Color,
    chart4: Color,
    chart5: Color,
    sidebar: Color,
    sidebarForeground: Color,
    sidebarPrimary: Color,
    sidebarPrimaryForeground: Color,
    sidebarAccent: Color,
    sidebarAccentForeground: Color,
    sidebarBorder: Color,
    sidebarRing: Color,
    radius: CGFloat = 10,
    fontDesign: Font.Design = .default
  ) {
    self.background = background
    self.foreground = foreground
    self.card = card
    self.cardForeground = cardForeground
    self.popover = popover
    self.popoverForeground = popoverForeground
    self.primary = primary
    self.primaryForeground = primaryForeground
    self.secondary = secondary
    self.secondaryForeground = secondaryForeground
    self.muted = muted
    self.mutedForeground = mutedForeground
    self.accent = accent
    self.accentForeground = accentForeground
    self.destructive = destructive
    self.destructiveForeground = destructiveForeground
    self.border = border
    self.input = input
    self.ring = ring
    self.chart1 = chart1
    self.chart2 = chart2
    self.chart3 = chart3
    self.chart4 = chart4
    self.chart5 = chart5
    self.sidebar = sidebar
    self.sidebarForeground = sidebarForeground
    self.sidebarPrimary = sidebarPrimary
    self.sidebarPrimaryForeground = sidebarPrimaryForeground
    self.sidebarAccent = sidebarAccent
    self.sidebarAccentForeground = sidebarAccentForeground
    self.sidebarBorder = sidebarBorder
    self.sidebarRing = sidebarRing
    self.radius = radius
    self.fontDesign = fontDesign
  }
}

// MARK: - Built-in preset

private struct SCDefaultPresetColors {
  let background: Color = Color(light: .white, dark: .zinc950)
  let foreground: Color = Color(light: .zinc950, dark: .zinc50)
  let card: Color = Color(light: .white, dark: .zinc900)
  let cardForeground: Color = Color(light: .zinc950, dark: .zinc50)
  let popover: Color = Color(light: .white, dark: .zinc900)
  let popoverForeground: Color = Color(light: .zinc950, dark: .zinc50)
  let primary: Color = Color(light: .zinc900, dark: .zinc50)
  let primaryForeground: Color = Color(light: .zinc50, dark: .zinc900)
  let secondary: Color = Color(light: .zinc100, dark: .zinc800)
  let secondaryForeground: Color = Color(light: .zinc900, dark: .zinc50)
  let muted: Color = Color(light: .zinc100, dark: .zinc800)
  let mutedForeground: Color = Color(light: .zinc500, dark: .zinc400)
  let accent: Color = Color(light: .zinc100, dark: .zinc800)
  let accentForeground: Color = Color(light: .zinc900, dark: .zinc50)
  let destructive: Color = Color(light: .red600, dark: .red700)
  let destructiveForeground: Color = Color(light: .white, dark: .white)
  let border: Color = Color(light: .zinc200, dark: .zinc800)
  let input: Color = Color(light: .zinc200, dark: .zinc800)
  let ring: Color = Color(light: .zinc400, dark: .zinc500)
  let chart1: Color = Color(light: Color(hex: 0xE8734A), dark: Color(hex: 0x2662D9))
  let chart2: Color = Color(light: Color(hex: 0x2A9D90), dark: Color(hex: 0x2EB88A))
  let chart3: Color = Color(light: Color(hex: 0x274754), dark: Color(hex: 0xE88C30))
  let chart4: Color = Color(light: Color(hex: 0xE8C468), dark: Color(hex: 0xAF57DB))
  let chart5: Color = Color(light: Color(hex: 0xF4A462), dark: Color(hex: 0xE23670))
  let sidebar: Color = Color(light: .zinc50, dark: .zinc900)
  let sidebarForeground: Color = Color(light: .zinc950, dark: .zinc50)
  let sidebarPrimary: Color = Color(light: .zinc900, dark: .zinc50)
  let sidebarPrimaryForeground: Color = Color(light: .zinc50, dark: .zinc900)
  let sidebarAccent: Color = Color(light: .zinc200, dark: .zinc800)
  let sidebarAccentForeground: Color = Color(light: .zinc900, dark: .zinc50)
  let sidebarBorder: Color = Color(light: .zinc200, dark: .zinc800)
  let sidebarRing: Color = Color(light: .zinc400, dark: .zinc500)
}

extension Theme {
  /// The built-in zinc preset. Other presets can be added as `Theme`
  /// extensions without changing component APIs.
  ///
  /// Built from typed locals rather than one 43-argument expression so
  /// consumer projects with stricter type-checker budgets (e.g. Xcode
  /// app targets under default MainActor isolation) compile it reliably.
  public static let `default` = makeDefaultPreset()

  private static func makeDefaultPreset() -> Theme {
    let colors = SCDefaultPresetColors()
    return Theme(
      background: colors.background,
      foreground: colors.foreground,
      card: colors.card,
      cardForeground: colors.cardForeground,
      popover: colors.popover,
      popoverForeground: colors.popoverForeground,
      primary: colors.primary,
      primaryForeground: colors.primaryForeground,
      secondary: colors.secondary,
      secondaryForeground: colors.secondaryForeground,
      muted: colors.muted,
      mutedForeground: colors.mutedForeground,
      accent: colors.accent,
      accentForeground: colors.accentForeground,
      destructive: colors.destructive,
      destructiveForeground: colors.destructiveForeground,
      border: colors.border,
      input: colors.input,
      ring: colors.ring,
      chart1: colors.chart1,
      chart2: colors.chart2,
      chart3: colors.chart3,
      chart4: colors.chart4,
      chart5: colors.chart5,
      sidebar: colors.sidebar,
      sidebarForeground: colors.sidebarForeground,
      sidebarPrimary: colors.sidebarPrimary,
      sidebarPrimaryForeground: colors.sidebarPrimaryForeground,
      sidebarAccent: colors.sidebarAccent,
      sidebarAccentForeground: colors.sidebarAccentForeground,
      sidebarBorder: colors.sidebarBorder,
      sidebarRing: colors.sidebarRing
    )
  }
}

// MARK: - Environment

private struct ThemeKey: EnvironmentKey {
  static let defaultValue = Theme.default
}

/// Internal cross-component context for controls attached by ButtonGroup.
enum SCGroupedControlOrientation {
  case horizontal, vertical
}

private struct SCGroupedControlOrientationKey: EnvironmentKey {
  static let defaultValue: SCGroupedControlOrientation? = nil
}

extension EnvironmentValues {
  public var theme: Theme {
    get { self[ThemeKey.self] }
    set { self[ThemeKey.self] = newValue }
  }

  var scGroupedControlOrientation: SCGroupedControlOrientation? {
    get { self[SCGroupedControlOrientationKey.self] }
    set { self[SCGroupedControlOrientationKey.self] = newValue }
  }
}

extension View {
  /// Applies a swiftcn theme to this view hierarchy — the equivalent of
  /// setting shadcn's CSS variables on a root element. Because the
  /// environment cascades, themes can be overridden per subtree.
  public func theme(_ theme: Theme) -> some View {
    environment(\.theme, theme)
      .fontDesign(theme.fontDesign)
  }
}
