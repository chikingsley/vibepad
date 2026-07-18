import SwiftUI

struct OnboardingVerificationProgressView: View {
  let activity: HostOnboardingActivity
  @Environment(\.theme) private var theme

  private let labels = [
    "Reach computer",
    "Check OpenCode",
    "Prepare server",
    "Open tunnel",
    "Verify connection",
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: DesignSpacing.md) {
      HStack(spacing: DesignSpacing.sm) {
        ForEach(labels.indices, id: \.self) { index in
          SCProgress(
            value: progressValue(for: index),
            maximumValue: 1,
            accessibilityLabel: labels[index],
            trackHeight: 5
          )
        }
      }

      HStack(spacing: DesignSpacing.sm) {
        SCSpinner(size: 15, accessibilityLabel: Text(activity.title))
          .foregroundStyle(theme.primary)
        Text(activity.title)
          .font(.subheadline.weight(.medium))
        Spacer()
      }
    }
    .accessibilityIdentifier("onboarding-verification-progress")
  }

  private var currentIndex: Int {
    switch activity {
    case .reachingComputer: 0
    case .checkingOpenCode: 1
    case .installingOpenCode, .authorizingDevice, .startingOpenCode, .waitingForOpenCode: 2
    case .openingTunnel: 3
    case .verifyingConnection: 4
    }
  }

  private func progressValue(for index: Int) -> Double? {
    if index < currentIndex { return 1 }
    if index == currentIndex { return nil }
    return 0
  }
}
