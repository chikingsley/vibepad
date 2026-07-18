import Foundation
import Observation

enum HostOnboardingStep: Int, CaseIterable {
  case welcome
  case connection
  case configure
}

enum HostOnboardingMethod: String, CaseIterable, Identifiable {
  case ssh
  case direct

  var id: String { rawValue }
}

enum HostOnboardingActivity: Int, CaseIterable, Equatable {
  case reachingComputer
  case checkingOpenCode
  case installingOpenCode
  case authorizingDevice
  case startingOpenCode
  case waitingForOpenCode
  case openingTunnel
  case verifyingConnection

  var title: String {
    switch self {
    case .reachingComputer: "Reaching your computer"
    case .checkingOpenCode: "Checking OpenCode"
    case .installingOpenCode: "Installing OpenCode"
    case .authorizingDevice: "Authorizing this iPad"
    case .startingOpenCode: "Starting OpenCode"
    case .waitingForOpenCode: "Waiting for OpenCode"
    case .openingTunnel: "Opening the private tunnel"
    case .verifyingConnection: "Verifying the connection"
    }
  }

  init(_ stage: SSHBootstrapStage) {
    switch stage {
    case .connectingSSH: self = .reachingComputer
    case .inspectingHost: self = .checkingOpenCode
    case .installingOpenCode: self = .installingOpenCode
    case .authorizingDevice: self = .authorizingDevice
    case .startingOpenCode: self = .startingOpenCode
    case .waitingForHealth: self = .waitingForOpenCode
    }
  }
}

enum HostOnboardingPhase: Equatable {
  case idle
  case checking(HostOnboardingActivity)
  case installationRequired
  case startRequired
  case connectRequired
  case provisioning(HostOnboardingActivity)
  case connected
  case unreachable(String)

  var isWorking: Bool {
    switch self {
    case .checking, .provisioning: true
    default: false
    }
  }
}

private enum HostOnboardingFixture: String {
  case welcome
  case choice
  case form
  case checking
  case install
  case start
  case connected
  case offline
}

@MainActor
@Observable
final class HostOnboardingStore {
  var step: HostOnboardingStep = .welcome
  var method: HostOnboardingMethod = .ssh
  var profileName = "My Mac"

  var directURL = ""
  var apiUsername = ""
  var apiPassword = ""

  var sshHost = ""
  var sshPort = 22
  var sshUsername = ""
  var sshPassword = ""
  var remotePort = 19_001

  var inspection: SSHBootstrapInspection?
  var phase: HostOnboardingPhase = .idle
  var errorDetail: String?
  var showsInstallConfirmation = false

  private let bootstrapService: SSHBootstrapService

  init(bootstrapService: SSHBootstrapService = SSHBootstrapService()) {
    self.bootstrapService = bootstrapService
    applyUITestFixture()
  }

  var request: SSHBootstrapRequest {
    SSHBootstrapRequest(
      host: sshHost,
      port: sshPort,
      username: sshUsername,
      password: sshPassword,
      remotePort: remotePort,
      projectDirectory: "~"
    )
  }

  func inspectSSHHost() async {
    inspection = nil
    errorDetail = nil
    phase = .checking(.reachingComputer)
    do {
      let result = try await bootstrapService.inspect(request) { stage in
        self.phase = .checking(HostOnboardingActivity(stage))
      }
      inspection = result
      if !result.isOpenCodeInstalled {
        phase = .installationRequired
      } else if result.serverHealthy {
        phase = .connectRequired
      } else {
        phase = .startRequired
      }
    } catch {
      errorDetail = error.localizedDescription
      phase = .unreachable(Self.friendlySSHFailure(error))
    }
  }

  func connectDirect(state: AppState) async {
    errorDetail = nil
    phase = .checking(.verifyingConnection)
    do {
      let info = AppState.serverURLInfo(directURL)
      guard info.isAllowed, let normalized = info.normalized else {
        throw HostOnboardingFailure.invalidServerURL(info.warning ?? "Enter the OpenCode server URL.")
      }

      let profileID = UUID()
      let profile = HostProfile(
        id: profileID,
        name: resolvedProfileName(fallback: info.host ?? "OpenCode"),
        transport: .direct,
        serverURL: normalized,
        basicAuth: apiUsername.isEmpty && apiPassword.isEmpty
          ? nil
          : BasicAuthConfig(
            username: apiUsername,
            keychainPasswordID: AppState.passwordKeychainID(for: profileID)
          ),
        ssh: nil,
        lastUsedAt: Date()
      )
      state.saveHostProfile(profile, password: apiPassword)
      await state.refresh()
      guard state.isConnected else {
        throw HostOnboardingFailure.connectionFailed(
          state.connectionError ?? "OpenCode did not answer its health check.")
      }
      phase = .connected
      state.hasCompletedOnboarding = true
    } catch {
      errorDetail = error.localizedDescription
      phase = .unreachable(error.localizedDescription)
    }
  }

  func provisionSSH(state: AppState, allowInstallation: Bool) async {
    errorDetail = nil
    phase = .provisioning(.reachingComputer)
    do {
      let publicKey = try state.sshTunnelManager.generateOrGetPublicKey()
      let result = try await bootstrapService.provision(
        request,
        installOpenCode: allowInstallation,
        devicePublicKey: publicKey
      ) { stage in
        self.phase = .provisioning(HostOnboardingActivity(stage))
      }
      inspection = result

      let profile = HostProfile(
        name: resolvedProfileName(fallback: sshHost),
        transport: .sshTunnel,
        serverURL: APIClient.defaultServer,
        basicAuth: nil,
        ssh: SSHTunnelConfig(
          isEnabled: true,
          host: sshHost.trimmingCharacters(in: .whitespacesAndNewlines),
          port: sshPort,
          username: sshUsername.trimmingCharacters(in: .whitespacesAndNewlines),
          remotePort: remotePort
        ),
        lastUsedAt: Date()
      )
      state.saveHostProfile(profile)
      sshPassword = ""
      phase = .provisioning(.openingTunnel)
      await state.sshTunnelManager.connect()
      phase = .provisioning(.verifyingConnection)
      await state.refresh()
      guard state.isConnected else {
        throw HostOnboardingFailure.connectionFailed(
          state.connectionError ?? "The SSH tunnel opened, but OpenCode did not answer its health check."
        )
      }
      phase = .connected
      state.hasCompletedOnboarding = true
    } catch {
      errorDetail = error.localizedDescription
      phase = .unreachable(Self.friendlySSHFailure(error))
    }
  }

  func useAnotherComputer() {
    sshHost = ""
    sshUsername = ""
    sshPassword = ""
    inspection = nil
    errorDetail = nil
    phase = .idle
  }

  func resetConnectionAttempt() {
    inspection = nil
    errorDetail = nil
    showsInstallConfirmation = false
    phase = .idle
  }

  private func resolvedProfileName(fallback: String) -> String {
    let trimmed = profileName.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? fallback : trimmed
  }

  private static func friendlySSHFailure(_ error: Error) -> String {
    let message = error.localizedDescription
    let lowercased = message.lowercased()
    if lowercased.contains("authentication") || lowercased.contains("password")
      || lowercased.contains("permission denied")
    {
      return "SSH rejected the username or password. Check the credentials and try again."
    }
    if lowercased.contains("host key") {
      return "VibePad could not verify this computer's SSH identity."
    }
    return "This computer is offline or SSH isn't reachable."
  }

  private func applyUITestFixture() {
    guard ProcessInfo.processInfo.arguments.contains("UITEST_ONBOARDING_FIXTURE") else { return }
    let rawValue = ProcessInfo.processInfo.environment["UITEST_ONBOARDING_STATE"] ?? "welcome"
    guard let fixture = HostOnboardingFixture(rawValue: rawValue) else { return }

    profileName = fixture == .offline ? "Team Mac" : "My Mac"
    sshHost = fixture == .offline ? "team-mac" : "gmk-server"
    sshUsername = "simon"
    applyLiveSSHFixtureEnvironment()

    switch fixture {
    case .welcome:
      step = .welcome
    case .choice:
      step = .connection
    case .form:
      step = .configure
    case .checking:
      step = .configure
      phase = .checking(.checkingOpenCode)
    case .install:
      step = .configure
      inspection = SSHBootstrapInspection(
        platform: "Linux", openCodePath: nil, openCodeVersion: nil, serverHealthy: false)
      phase = .installationRequired
    case .start:
      step = .configure
      inspection = SSHBootstrapInspection(
        platform: "macOS", openCodePath: "/Users/simon/.opencode/bin/opencode",
        openCodeVersion: "1.17.15", serverHealthy: false)
      phase = .startRequired
    case .connected:
      step = .configure
      inspection = SSHBootstrapInspection(
        platform: "macOS", openCodePath: "/Users/simon/.opencode/bin/opencode",
        openCodeVersion: "1.17.15", serverHealthy: true)
      phase = .connected
    case .offline:
      step = .configure
      phase = .unreachable("This computer is offline or SSH isn't reachable.")
    }
  }

  private func applyLiveSSHFixtureEnvironment() {
    let environment = ProcessInfo.processInfo.environment
    if let value = environment["UITEST_SSH_NAME"] { profileName = value }
    if let value = environment["UITEST_SSH_HOST"] { sshHost = value }
    if let value = environment["UITEST_SSH_PORT"].flatMap(Int.init) { sshPort = value }
    if let value = environment["UITEST_SSH_USERNAME"] { sshUsername = value }
    if let value = environment["UITEST_SSH_PASSWORD"] { sshPassword = value }
    if let value = environment["UITEST_OPENCODE_PORT"].flatMap(Int.init) { remotePort = value }
  }
}

private enum HostOnboardingFailure: LocalizedError {
  case invalidServerURL(String)
  case connectionFailed(String)

  var errorDescription: String? {
    switch self {
    case .invalidServerURL(let message), .connectionFailed(let message): message
    }
  }
}
