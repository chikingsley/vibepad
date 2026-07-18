import SwiftUI

struct OnboardingDirectFormView: View {
  @Bindable var state: AppState
  @Bindable var store: HostOnboardingStore
  let onBack: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DesignSpacing.xl) {
      SCFieldSet(spacing: DesignSpacing.lg, isDisabled: store.phase.isWorking) {
        OnboardingTextField(
          label: "Name", placeholder: "OpenCode", text: $store.profileName, icon: "desktopcomputer")
        OnboardingTextField(
          label: "Server URL",
          placeholder: "https://opencode.example.com",
          text: $store.directURL,
          icon: "link",
          accessibilityIdentifier: "onboarding-direct-url"
        )
        HStack(alignment: .top, spacing: DesignSpacing.md) {
          OnboardingTextField(
            label: "Basic auth username", placeholder: "Optional", text: $store.apiUsername, icon: "person")
          OnboardingTextField(
            label: "Basic auth password",
            placeholder: "Optional",
            text: $store.apiPassword,
            icon: "key",
            isSecure: true
          )
        }
      }

      HostVerificationStatusView(
        phase: store.phase,
        inspection: store.inspection,
        errorDetail: store.errorDetail,
        remotePort: store.remotePort
      )

      HStack {
        Button("Back", action: onBack).buttonStyle(.sc(.ghost))
        Spacer()
        Button("Connect") { Task { await store.connectDirect(state: state) } }
          .buttonStyle(.sc())
          .disabled(store.phase.isWorking)
          .accessibilityIdentifier("onboarding-connect-direct")
      }
    }
  }
}
