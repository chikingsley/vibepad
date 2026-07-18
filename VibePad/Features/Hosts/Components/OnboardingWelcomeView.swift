import SwiftUI

struct OnboardingWelcomeView: View {
  let onContinue: () -> Void
  @Environment(\.theme) private var theme

  var body: some View {
    VStack(spacing: DesignSpacing.xxl) {
      Image(systemName: "ipad.and.iphone")
        .font(.system(size: 48, weight: .medium))
        .foregroundStyle(theme.primary)

      VStack(spacing: DesignSpacing.sm) {
        Text("Code from your iPad")
          .font(.largeTitle.bold())
        Text("Connect to your computer, work with OpenCode, and keep the whole workspace within reach.")
          .font(.title3)
          .foregroundStyle(theme.mutedForeground)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 560)
      }

      Button("Get started", action: onContinue)
        .buttonStyle(.sc(size: .lg))
        .accessibilityIdentifier("onboarding-get-started")
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 72)
  }
}
