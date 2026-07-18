@preconcurrency import Citadel
import Foundation
@preconcurrency import NIOCore

nonisolated struct SSHBootstrapRequest: Equatable, Sendable {
  var host: String
  var port: Int
  var username: String
  var password: String
  var remotePort: Int
  var projectDirectory: String
}

nonisolated struct SSHBootstrapInspection: Equatable, Sendable {
  var platform: String
  var openCodePath: String?
  var openCodeVersion: String?
  var serverHealthy: Bool

  var isOpenCodeInstalled: Bool { openCodePath != nil }
}

nonisolated enum SSHBootstrapStage: Int, CaseIterable, Equatable, Sendable {
  case connectingSSH
  case inspectingHost
  case installingOpenCode
  case authorizingDevice
  case startingOpenCode
  case waitingForHealth
}

nonisolated enum SSHBootstrapError: LocalizedError, Equatable, Sendable {
  case invalidHost
  case invalidPort
  case invalidUsername
  case passwordRequired
  case installationConsentRequired
  case installationFailed
  case serverDidNotBecomeHealthy
  case emptyCommandOutput

  var errorDescription: String? {
    switch self {
    case .invalidHost: return "Enter the SSH host name or Tailscale address."
    case .invalidPort: return "Enter valid SSH and OpenCode ports."
    case .invalidUsername: return "Enter the SSH username."
    case .passwordRequired: return "Enter the SSH password for initial setup."
    case .installationConsentRequired: return "OpenCode is not installed on this host."
    case .installationFailed: return "OpenCode installation completed without producing an executable."
    case .serverDidNotBecomeHealthy: return "OpenCode started, but its health endpoint did not become ready."
    case .emptyCommandOutput: return "The SSH host returned an empty bootstrap response."
    }
  }
}

@MainActor
final class SSHBootstrapService {
  func inspect(
    _ request: SSHBootstrapRequest,
    progress: ((SSHBootstrapStage) -> Void)? = nil
  ) async throws -> SSHBootstrapInspection {
    try validate(request)
    progress?(.connectingSSH)
    return try await withClient(request) { client in
      progress?(.inspectingHost)
      return try await inspect(client: client, remotePort: request.remotePort)
    }
  }

  func provision(
    _ request: SSHBootstrapRequest,
    installOpenCode: Bool,
    devicePublicKey: String,
    progress: ((SSHBootstrapStage) -> Void)? = nil
  ) async throws -> SSHBootstrapInspection {
    try validate(request)
    progress?(.connectingSSH)
    return try await withClient(request) { client in
      progress?(.inspectingHost)
      var inspection = try await inspect(client: client, remotePort: request.remotePort)
      if !inspection.isOpenCodeInstalled {
        guard installOpenCode else { throw SSHBootstrapError.installationConsentRequired }
        progress?(.installingOpenCode)
        _ = try await execute(client, command: Self.installOpenCodeCommand)
        progress?(.inspectingHost)
        inspection = try await inspect(client: client, remotePort: request.remotePort)
        guard inspection.isOpenCodeInstalled else { throw SSHBootstrapError.installationFailed }
      }

      progress?(.authorizingDevice)
      _ = try await execute(client, command: Self.authorizeKeyCommand(publicKey: devicePublicKey))
      progress?(.startingOpenCode)
      _ = try await execute(
        client,
        command: Self.startServerCommand(
          remotePort: request.remotePort,
          projectDirectory: request.projectDirectory
        )
      )

      progress?(.waitingForHealth)
      for attempt in 0..<12 {
        inspection = try await inspect(client: client, remotePort: request.remotePort)
        if inspection.serverHealthy { return inspection }
        if attempt < 11 { try await Task.sleep(for: .milliseconds(500)) }
      }
      throw SSHBootstrapError.serverDidNotBecomeHealthy
    }
  }

  nonisolated static let installOpenCodeCommand = "curl -fsSL https://opencode.ai/install | bash"

  nonisolated static func authorizeKeyCommand(publicKey: String) -> String {
    let key = shellQuote(publicKey.trimmingCharacters(in: .whitespacesAndNewlines))
    return
      "umask 077; mkdir -p \"$HOME/.ssh\"; touch \"$HOME/.ssh/authorized_keys\"; chmod 700 \"$HOME/.ssh\"; chmod 600 \"$HOME/.ssh/authorized_keys\"; grep -qxF \(key) \"$HOME/.ssh/authorized_keys\" || printf '%s\\n' \(key) >> \"$HOME/.ssh/authorized_keys\""
  }

  nonisolated static func startServerCommand(remotePort: Int, projectDirectory: String) -> String {
    let directory = shellDirectory(projectDirectory)
    return
      "set -eu; if command -v opencode >/dev/null 2>&1; then bin=\"$(command -v opencode)\"; else bin=\"$HOME/.opencode/bin/opencode\"; fi; if curl -fsS --max-time 2 http://127.0.0.1:\(remotePort)/api/health >/dev/null 2>&1 || curl -fsS --max-time 2 http://127.0.0.1:\(remotePort)/global/health >/dev/null 2>&1 || curl -fsS --max-time 2 http://127.0.0.1:\(remotePort)/health >/dev/null 2>&1; then exit 0; fi; mkdir -p \"$HOME/.local/state/vibepad\"; cd \(directory); nohup \"$bin\" serve --hostname 127.0.0.1 --port \(remotePort) > \"$HOME/.local/state/vibepad/opencode-\(remotePort).log\" 2>&1 < /dev/null &"
  }

  nonisolated static func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
  }

  nonisolated static func shellDirectory(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty || trimmed == "~" { return "\"$HOME\"" }
    if trimmed.hasPrefix("~/") {
      return "\"$HOME\"/\(shellQuote(String(trimmed.dropFirst(2))))"
    }
    return shellQuote(trimmed)
  }

  private func validate(_ request: SSHBootstrapRequest) throws {
    guard !request.host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw SSHBootstrapError.invalidHost
    }
    guard request.port > 0, request.port <= 65_535, request.remotePort > 0, request.remotePort <= 65_535 else {
      throw SSHBootstrapError.invalidPort
    }
    guard !request.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw SSHBootstrapError.invalidUsername
    }
    guard !request.password.isEmpty else { throw SSHBootstrapError.passwordRequired }
  }

  private func withClient<T>(
    _ request: SSHBootstrapRequest,
    operation: (SSHClient) async throws -> T
  ) async throws -> T {
    let host = request.host.trimmingCharacters(in: .whitespacesAndNewlines)
    let username = request.username.trimmingCharacters(in: .whitespacesAndNewlines)
    let settings = SSHClientSettings(
      host: host,
      port: request.port,
      authenticationMethod: { .passwordBased(username: username, password: request.password) },
      hostKeyValidator: .custom(SSHTOFUHostKeyValidator(host: host, port: request.port))
    )
    let client = try await SSHClient.connect(to: settings)
    do {
      let result = try await operation(client)
      try await client.close()
      return result
    } catch {
      try? await client.close()
      throw error
    }
  }

  private func inspect(client: SSHClient, remotePort: Int) async throws -> SSHBootstrapInspection {
    let output = try await execute(client, command: Self.inspectionCommand(remotePort: remotePort))
    guard !output.isEmpty else { throw SSHBootstrapError.emptyCommandOutput }
    let values = Dictionary(
      uniqueKeysWithValues: output.split(separator: "\n").compactMap { line -> (String, String)? in
        guard let separator = line.firstIndex(of: "=") else { return nil }
        return (String(line[..<separator]), String(line[line.index(after: separator)...]))
      }
    )
    let path = values["opencode_path"].flatMap { $0.isEmpty ? nil : $0 }
    let version = values["opencode_version"].flatMap { $0.isEmpty ? nil : $0 }
    return SSHBootstrapInspection(
      platform: values["platform"] ?? "Unknown",
      openCodePath: path,
      openCodeVersion: version,
      serverHealthy: values["server_healthy"] == "true"
    )
  }

  private nonisolated static func inspectionCommand(remotePort: Int) -> String {
    "printf 'platform='; uname -s 2>/dev/null || printf 'Unknown'; printf '\\n'; if command -v opencode >/dev/null 2>&1; then bin=\"$(command -v opencode)\"; elif [ -x \"$HOME/.opencode/bin/opencode\" ]; then bin=\"$HOME/.opencode/bin/opencode\"; else bin=''; fi; printf 'opencode_path=%s\\n' \"$bin\"; if [ -n \"$bin\" ]; then printf 'opencode_version='; \"$bin\" --version 2>/dev/null || true; printf '\\n'; else printf 'opencode_version=\\n'; fi; if curl -fsS --max-time 2 http://127.0.0.1:\(remotePort)/api/health >/dev/null 2>&1 || curl -fsS --max-time 2 http://127.0.0.1:\(remotePort)/global/health >/dev/null 2>&1 || curl -fsS --max-time 2 http://127.0.0.1:\(remotePort)/health >/dev/null 2>&1; then printf 'server_healthy=true\\n'; else printf 'server_healthy=false\\n'; fi"
  }

  private func execute(_ client: SSHClient, command: String) async throws -> String {
    var buffer = try await client.executeCommand(command, maxResponseSize: 1_048_576, mergeStreams: true)
    return buffer.readString(length: buffer.readableBytes)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  }
}
