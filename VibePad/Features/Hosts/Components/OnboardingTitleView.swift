import SwiftUI

struct OnboardingTitleView: View {
  let title: String
  let subtitle: String
  @Environment(\.theme) private var theme

  var body: some View {
    VStack(spacing: DesignSpacing.sm) {
      Text(title).font(.title.bold())
      Text(subtitle)
        .font(.body)
        .foregroundStyle(theme.mutedForeground)
        .multilineTextAlignment(.center)
        .frame(maxWidth: 620)
    }
    .frame(maxWidth: .infinity)
  }
}
