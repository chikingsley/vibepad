import SwiftUI

struct HostOnboardingView: View {
  @Bindable var state: AppState
  @State private var store = HostOnboardingStore()
  @Environment(\.theme) private var theme

  var body: some View {
    ZStack {
      theme.background.ignoresSafeArea()

      VStack(spacing: 0) {
        OnboardingHeaderView(step: store.step)
        ScrollView {
          content
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 32)
            .padding(.vertical, 48)
        }
        .scrollBounceBehavior(.basedOnSize)
      }
    }
    .scAlertDialog(
      isPresented: $store.showsInstallConfirmation,
      title: "Install OpenCode on this computer?",
      message:
        "VibePad will run OpenCode's official installer over SSH, then start a private server on port \(store.remotePort).",
      confirmLabel: "Install and connect"
    ) {
      Task { await store.provisionSSH(state: state, allowInstallation: true) }
    }
    .accessibilityIdentifier("onboarding-root")
  }

  @ViewBuilder
  private var content: some View {
    switch store.step {
    case .welcome:
      OnboardingWelcomeView { store.step = .connection }
    case .connection:
      OnboardingConnectionChoiceView(
        onBack: { store.step = .welcome },
        onSelfHosted: { store.step = .configure }
      )
    case .configure:
      OnboardingSelfHostedView(
        state: state,
        store: store,
        onBack: { store.step = .connection }
      )
    }
  }
}
