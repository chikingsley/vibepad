import SwiftUI

struct OnboardingSSHFormView: View {
  @Bindable var state: AppState
  @Bindable var store: HostOnboardingStore
  let onBack: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DesignSpacing.xl) {
      SCFieldSet(spacing: DesignSpacing.lg, isDisabled: store.phase.isWorking) {
        OnboardingTextField(
          label: "Name",
          placeholder: "My Mac",
          text: $store.profileName,
          icon: "desktopcomputer"
        )

        HStack(alignment: .top, spacing: DesignSpacing.md) {
          OnboardingTextField(
            label: "SSH host",
            placeholder: "my-mac.tailnet.ts.net",
            text: $store.sshHost,
            icon: "network",
            accessibilityIdentifier: "onboarding-ssh-host"
          )
          OnboardingNumberField(label: "SSH port", placeholder: "22", value: $store.sshPort)
            .frame(width: 112)
          OnboardingNumberField(label: "OpenCode port", placeholder: "19001", value: $store.remotePort)
            .frame(width: 142)
        }

        HStack(alignment: .top, spacing: DesignSpacing.md) {
          OnboardingTextField(
            label: "Username",
            placeholder: "simon",
            text: $store.sshUsername,
            icon: "person",
            accessibilityIdentifier: "onboarding-ssh-username"
          )
          OnboardingTextField(
            label: "Password",
            placeholder: "SSH password",
            text: $store.sshPassword,
            icon: "key",
            isSecure: true,
            accessibilityIdentifier: "onboarding-ssh-password"
          )
        }
      }

      Text("The password is used for initial setup and is never saved. VibePad starts OpenCode in your home directory.")
        .font(.caption)
        .foregroundStyle(.secondary)

      HostVerificationStatusView(
        phase: store.phase,
        inspection: store.inspection,
        errorDetail: store.errorDetail,
        remotePort: store.remotePort
      )

      actionRow
    }
  }

  private var actionRow: some View {
    HStack(spacing: DesignSpacing.sm) {
      Button("Back", action: onBack)
        .buttonStyle(.sc(.ghost))
        .disabled(store.phase.isWorking)
      Spacer()
      actionButtons
    }
  }

  @ViewBuilder
  private var actionButtons: some View {
    switch store.phase {
    case .idle:
      Button("Check host") { Task { await store.inspectSSHHost() } }
        .buttonStyle(.sc())
        .accessibilityIdentifier("onboarding-check-host")
    case .checking, .provisioning:
      Button {
      } label: {
        HStack(spacing: DesignSpacing.sm) {
          SCSpinner(size: 14)
          Text("Working")
        }
      }
      .buttonStyle(.sc())
      .disabled(true)
    case .installationRequired:
      Button("Install OpenCode") { store.showsInstallConfirmation = true }
        .buttonStyle(.sc())
        .accessibilityIdentifier("onboarding-install-opencode")
    case .startRequired:
      Button("Start and connect") {
        Task { await store.provisionSSH(state: state, allowInstallation: false) }
      }
      .buttonStyle(.sc())
      .accessibilityIdentifier("onboarding-start-opencode")
    case .connectRequired:
      Button("Connect") {
        Task { await store.provisionSSH(state: state, allowInstallation: false) }
      }
      .buttonStyle(.sc())
      .accessibilityIdentifier("onboarding-connect-opencode")
    case .connected:
      Button("Connected") {}
        .buttonStyle(.sc())
        .disabled(true)
    case .unreachable:
      Button("Use another computer") { store.useAnotherComputer() }
        .buttonStyle(.sc(.outline))
        .accessibilityIdentifier("onboarding-another-host")
      Button("Try again") { Task { await store.inspectSSHHost() } }
        .buttonStyle(.sc())
        .accessibilityIdentifier("onboarding-retry-host")
    }
  }
}
