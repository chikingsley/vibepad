import SwiftUI

struct OnboardingSelfHostedView: View {
  @Bindable var state: AppState
  @Bindable var store: HostOnboardingStore
  let onBack: () -> Void

  var body: some View {
    VStack(spacing: 28) {
      OnboardingTitleView(
        title: "Connect your computer",
        subtitle: "VibePad can check, install, and start OpenCode over SSH, or connect to an existing server URL."
      )

      SCTabs(selection: $store.method, spacing: 24) {
        SCTabsList {
          SCTabsTrigger("Set up with SSH", value: HostOnboardingMethod.ssh)
          SCTabsTrigger("Existing server URL", value: HostOnboardingMethod.direct)
        }
        .frame(maxWidth: .infinity, alignment: .center)

        SCTabsContent(value: HostOnboardingMethod.ssh) {
          OnboardingSSHFormView(state: state, store: store, onBack: onBack)
        }

        SCTabsContent(value: HostOnboardingMethod.direct) {
          OnboardingDirectFormView(state: state, store: store, onBack: onBack)
        }
      }
      .onChange(of: store.method) { oldMethod, newMethod in
        guard oldMethod != newMethod else { return }
        store.resetConnectionAttempt()
      }
    }
  }
}
