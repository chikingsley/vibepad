import SwiftUI

struct OnboardingConnectionChoiceView: View {
  let onBack: () -> Void
  let onSelfHosted: () -> Void

  var body: some View {
    VStack(spacing: 32) {
      OnboardingTitleView(
        title: "Choose where VibePad runs",
        subtitle: "Use your own Mac or server today. A managed VibePad workspace is coming later."
      )

      HStack(alignment: .center, spacing: DesignSpacing.lg) {
        SCItem(variant: .outline) {
          SCItemMedia(variant: .icon) {
            Image(systemName: "cloud")
          }
          SCItemContent {
            SCItemTitle("VibePad Cloud")
            SCItemDescription("A ready-to-use hosted workspace managed by VibePad.", lineLimit: nil)
              .frame(minHeight: 60, alignment: .top)
          }
          SCItemActions {
            Text("Coming soon")
              .font(.caption.weight(.semibold))
              .foregroundStyle(.secondary)
          }
        }
        .opacity(0.65)
        .accessibilityIdentifier("onboarding-cloud-coming-soon")

        SCItemButton(variant: .outline, action: onSelfHosted) {
          SCItemMedia(variant: .icon) {
            Image(systemName: "desktopcomputer")
          }
          SCItemContent {
            SCItemTitle("Self-hosted")
            SCItemDescription("Connect to a computer you control over SSH or a reachable URL.", lineLimit: nil)
              .frame(minHeight: 60, alignment: .top)
          }
          SCItemActions {
            Image(systemName: "arrow.right")
          }
        }
        .accessibilityIdentifier("onboarding-self-hosted")
      }
      .frame(minHeight: 142)

      HStack {
        Button("Back", action: onBack).buttonStyle(.sc(.ghost))
        Spacer()
      }
    }
  }
}
