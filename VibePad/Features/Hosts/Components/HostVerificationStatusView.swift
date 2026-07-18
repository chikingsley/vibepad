import SwiftUI

struct HostVerificationStatusView: View {
  let phase: HostOnboardingPhase
  let inspection: SSHBootstrapInspection?
  let errorDetail: String?
  let remotePort: Int
  @Environment(\.theme) private var theme

  @ViewBuilder
  var body: some View {
    switch phase {
    case .idle:
      EmptyView()
    case .checking(let activity), .provisioning(let activity):
      OnboardingVerificationProgressView(activity: activity)
    case .installationRequired:
      status(
        icon: "arrow.down.circle",
        title: "OpenCode needs to be installed",
        detail: "SSH is working. VibePad will ask before it runs the official installer.",
        command: SSHBootstrapService.installOpenCodeCommand
      )
    case .startRequired:
      status(
        icon: "play.circle",
        title: "OpenCode is installed but not running",
        detail: installedDetail,
        command: "opencode serve --hostname 127.0.0.1 --port \(remotePort)"
      )
    case .connectRequired:
      status(
        icon: "checkmark.circle",
        title: "OpenCode is already running",
        detail: "VibePad found a healthy server. It can now authorize this iPad and open the private tunnel."
      )
    case .connected:
      status(
        icon: "checkmark.circle.fill",
        title: "Connected",
        detail: "This computer and OpenCode are ready for VibePad."
      )
      .accessibilityIdentifier("onboarding-connected")
    case .unreachable(let message):
      status(
        icon: "wifi.slash",
        title: message,
        detail: offlineDetail
      )
      .accessibilityIdentifier("onboarding-unreachable")
    }
  }

  private var installedDetail: String {
    if let version = inspection?.openCodeVersion, !version.isEmpty {
      return "OpenCode \(version) is ready. VibePad will start it only after you press the button below."
    }
    return "OpenCode is ready. VibePad will start it only after you press the button below."
  }

  private var offlineDetail: String {
    guard let errorDetail, !errorDetail.isEmpty else {
      return "Make sure the computer is on, connected to the network, and accepting SSH connections."
    }
    return "Make sure the computer is on and reachable over SSH. Details: \(errorDetail)"
  }

  private func status(
    icon: String,
    title: String,
    detail: String,
    command: String? = nil
  ) -> some View {
    SCItem(variant: .muted) {
      SCItemMedia(variant: .icon) {
        Image(systemName: icon)
          .foregroundStyle(theme.primary)
      }
      SCItemContent {
        SCItemTitle(title)
        SCItemDescription(detail, lineLimit: nil)
        if let command {
          Text(command)
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(theme.mutedForeground)
            .textSelection(.enabled)
            .padding(.top, DesignSpacing.xs)
        }
      }
    }
  }
}
