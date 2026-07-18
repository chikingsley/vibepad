import SwiftUI

struct OnboardingHeaderView: View {
  let step: HostOnboardingStep
  @Environment(\.theme) private var theme

  var body: some View {
    HStack(spacing: DesignSpacing.md) {
      Label("VibePad", systemImage: "scribble.variable")
        .font(.headline)
      Spacer()
      HStack(spacing: DesignSpacing.sm) {
        ForEach(HostOnboardingStep.allCases, id: \.rawValue) { candidate in
          SCProgress(
            value: candidate.rawValue <= step.rawValue ? 1 : 0,
            maximumValue: 1,
            accessibilityLabel: "Onboarding step \(candidate.rawValue + 1)",
            trackHeight: 5
          )
          .frame(width: 44)
        }
      }
    }
    .padding(.horizontal, 24)
    .frame(height: 58)
    .overlay(alignment: .bottom) {
      Rectangle().fill(theme.border).frame(height: 1)
    }
  }
}
