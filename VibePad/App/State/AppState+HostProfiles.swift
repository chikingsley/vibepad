import Foundation

extension AppState {
  func loadHostProfilesFromStorageOrLegacy() {
    if let decoded = hostProfileRepository.loadProfiles(), !decoded.isEmpty {
      hostProfiles = decoded
      if let id = hostProfileRepository.selectedProfileID(validIn: decoded) {
        currentHostProfileID = id
      } else {
        currentHostProfileID = decoded[0].id
      }
      return
    }

    var profile = HostProfile.defaultProfile(serverURL: _serverURL)
    if !_username.isEmpty || !_password.isEmpty {
      let passwordID = Self.passwordKeychainID(for: profile.id)
      if !_password.isEmpty {
        hostProfileRepository.savePassword(_password, id: passwordID)
      }
      profile.basicAuth = BasicAuthConfig(username: _username, keychainPasswordID: passwordID)
    }

    if sshTunnelManager.config.isEnabled {
      profile.name = L10n.t(.hostDefaultSSHName)
      profile.transport = .sshTunnel
      profile.serverURL = APIClient.defaultServer
      profile.ssh = sshTunnelManager.config
    }

    hostProfiles = [profile]
    currentHostProfileID = profile.id
    saveHostProfiles()
  }

  func saveHostProfiles() {
    hostProfileRepository.saveProfiles(hostProfiles)
  }

  func trustPendingSSHHostKeyAndReconnect() async {
    sshTunnelManager.trustPendingHostKey()
    pendingSSHHostKeyMismatch = nil
    sshTunnelManager.disconnect()
    await testConnection()
  }

  func dismissPendingSSHHostKeyMismatch() {
    pendingSSHHostKeyMismatch = nil
  }

  func applyCurrentHostProfileToRuntime(persistLegacy: Bool = true) {
    guard let profile = currentHostProfile else { return }

    _serverURL = profile.serverURL
    _username = profile.basicAuth?.username ?? ""
    if let passwordID = profile.basicAuth?.keychainPasswordID {
      _password = hostProfileRepository.password(id: passwordID) ?? ""
    } else {
      _password = ""
    }

    if persistLegacy {
      defaults.set(_serverURL, forKey: Self.serverURLKey)
      defaults.set(_username, forKey: Self.usernameKey)
      hostProfileRepository.savePassword(_password, id: Self.passwordKeychainKey)
    }

    switch profile.transport {
    case .direct:
      var disabled = sshTunnelManager.config
      disabled.isEnabled = false
      sshTunnelManager.config = disabled
      sshTunnelManager.disconnect()
    case .sshTunnel:
      var config = profile.ssh ?? .default
      config.isEnabled = true
      sshTunnelManager.config = config
    }
  }

  func persistRuntimeToCurrentHostProfile() {
    guard let index = hostProfiles.firstIndex(where: { $0.id == currentHostProfileID }) else { return }
    var profile = hostProfiles[index]
    profile.serverURL = serverURL
    profile.lastUsedAt = Date()

    if username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && password.isEmpty {
      if let oldID = profile.basicAuth?.keychainPasswordID {
        hostProfileRepository.deletePassword(id: oldID)
      }
      profile.basicAuth = nil
    } else {
      let passwordID = profile.basicAuth?.keychainPasswordID ?? Self.passwordKeychainID(for: profile.id)
      hostProfileRepository.savePassword(password, id: passwordID)
      profile.basicAuth = BasicAuthConfig(username: username, keychainPasswordID: passwordID)
    }

    if profile.transport == .sshTunnel {
      profile.ssh = sshTunnelManager.config
    }

    hostProfiles[index] = profile
    saveHostProfiles()
  }

  func saveHostProfile(_ profile: HostProfile, password: String? = nil, makeCurrent: Bool = true) {
    var saved = profile
    if saved.transport == .sshTunnel {
      var ssh = saved.ssh ?? .default
      ssh.isEnabled = true
      saved.ssh = ssh
      saved.serverURL = APIClient.defaultServer
    }
    if let password {
      let username = profile.basicAuth?.username ?? ""
      if username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && password.isEmpty {
        saved.basicAuth = nil
      } else {
        let passwordID = profile.basicAuth?.keychainPasswordID ?? Self.passwordKeychainID(for: profile.id)
        hostProfileRepository.savePassword(password, id: passwordID)
        saved.basicAuth = BasicAuthConfig(username: username, keychainPasswordID: passwordID)
      }
    }

    if let index = hostProfiles.firstIndex(where: { $0.id == saved.id }) {
      hostProfiles[index] = saved
    } else {
      hostProfiles.append(saved)
    }
    saveHostProfiles()

    if makeCurrent {
      currentHostProfileID = saved.id
      applyCurrentHostProfileToRuntime()
    }
  }

  func switchHostProfile(to id: UUID) async {
    guard id != currentHostProfileID,
      hostProfiles.contains(where: { $0.id == id })
    else { return }
    persistRuntimeToCurrentHostProfile()
    disconnectSSE()
    sshTunnelManager.disconnect()
    currentHostProfileID = id
    applyCurrentHostProfileToRuntime()
    resetConnectionRuntimeForHostSwitch()
    await refresh()
  }

  func deleteHostProfile(_ profile: HostProfile) throws {
    guard hostProfiles.count > 1 else { throw HostProfileError.cannotDeleteOnlyHost }
    let wasCurrent = profile.id == currentHostProfileID
    if let passwordID = profile.basicAuth?.keychainPasswordID {
      hostProfileRepository.deletePassword(id: passwordID)
    }
    hostProfiles.removeAll { $0.id == profile.id }
    if wasCurrent, let first = hostProfiles.first {
      currentHostProfileID = first.id
      applyCurrentHostProfileToRuntime()
      resetConnectionRuntimeForHostSwitch()
    }
    saveHostProfiles()
  }

  func duplicateHostProfile(_ profile: HostProfile) {
    var copy = profile
    copy.id = UUID()
    copy.name = L10n.t(.hostDuplicateName, profile.displayName)
    copy.lastUsedAt = nil
    if let auth = profile.basicAuth {
      let newPasswordID = Self.passwordKeychainID(for: copy.id)
      if let password = hostProfileRepository.password(id: auth.keychainPasswordID) {
        hostProfileRepository.savePassword(password, id: newPasswordID)
      }
      copy.basicAuth = BasicAuthConfig(username: auth.username, keychainPasswordID: newPasswordID)
    }
    saveHostProfile(copy, makeCurrent: false)
  }

  func importHostProfile(from json: String) throws -> HostProfile {
    guard let data = json.data(using: .utf8) else {
      throw HostProfileError.invalidImport(L10n.t(.hostImportErrorInvalidUTF8))
    }
    do {
      let payload = try JSONDecoder().decode(HostProfileImportPayload.self, from: data)
      return try payload.makeProfile()
    } catch let error as HostProfileError {
      throw error
    } catch {
      throw HostProfileError.invalidImport(error.localizedDescription)
    }
  }

  func hostConfigJSON(for profile: HostProfile) throws -> String {
    let payload: HostProfileExportPayload
    switch profile.transport {
    case .direct:
      payload = HostProfileExportPayload(
        name: profile.displayName,
        transport: .direct,
        serverURL: profile.serverURL,
        ssh: nil
      )
    case .sshTunnel:
      let ssh = profile.ssh.map {
        HostProfileExportSSH(host: $0.host, port: $0.port, username: $0.username, remotePort: $0.remotePort)
      }
      payload = HostProfileExportPayload(
        name: profile.displayName,
        transport: .sshTunnel,
        serverURL: nil,
        ssh: ssh
      )
    }

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(payload)
    guard let json = String(data: data, encoding: .utf8) else {
      throw HostProfileError.invalidImport(L10n.t(.hostExportErrorEncodeConfigJSON))
    }
    return json
  }

  func updateConnectionDiagnostic(phase: ConnectionPhase, message: String, recoveryHint: String? = nil) {
    connectionDiagnostic = ConnectionDiagnostic(
      hostProfileID: currentHostProfileID,
      phase: phase,
      message: message,
      recoveryHint: recoveryHint,
      timestamp: Date()
    )
  }

  func friendlyConnectionError(_ error: Error, phase: ConnectionPhase = .failed) -> String {
    if let apiError = error as? APIError {
      switch apiError {
      case .invalidURL:
        return L10n.t(.hostConnectionErrorInvalidURL)
      case .httpError(let statusCode, _):
        if statusCode == 401 { return L10n.t(.hostConnectionErrorBasicAuthRejected) }
        return L10n.t(.hostConnectionErrorHTTPStatus, Int32(statusCode))
      }
    }

    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain {
      switch nsError.code {
      case NSURLErrorCannotConnectToHost, NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
        return L10n.t(.hostConnectionErrorCannotConnect)
      case NSURLErrorTimedOut:
        return L10n.t(.hostConnectionErrorTimedOut)
      case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
        return L10n.t(.hostConnectionErrorDNS)
      default:
        return L10n.t(.hostConnectionErrorNetwork, nsError.localizedDescription)
      }
    }

    let message = error.localizedDescription
    if message.contains("APIError error") {
      return phase == .health
        ? L10n.t(.hostConnectionErrorHealthCheckFailed)
        : L10n.t(.hostConnectionErrorGeneric)
    }
    return message
  }

  func resetConnectionRuntimeForHostSwitch() {
    isConnected = false
    connectionError = nil
    connectionDiagnostic = nil
    serverVersion = nil
    projects = []
    serverCurrentProjectWorktree = nil
    sessions = []
    currentSessionID = nil
    messages = []
    partsByMessage = [:]
    sessionDiffs = []
    fileTreeRoot = []
    pendingPermissions = []
    sessionStatuses = [:]
    sessionTodos = [:]
  }

  nonisolated static func passwordKeychainID(for profileID: UUID) -> String {
    "hostProfile.\(profileID.uuidString).password"
  }
}
