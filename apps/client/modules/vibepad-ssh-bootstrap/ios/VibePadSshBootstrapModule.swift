@preconcurrency import Citadel
import Crypto
import ExpoModulesCore
import Foundation
@preconcurrency import NIOCore
import NIOSSH
import Security

private struct SshBootstrapInput: Record {
  @Field var host = ""
  @Field var password = ""
  @Field var port = 22
  @Field var username = ""
}

private struct SshBootstrapResult: Record {
  @Field var invitationUrl = ""
  @Field var recoveryKeyId: String?
}

private struct SshInstallAndPairInput: Record {
  @Field var automaticStart = false
  @Field var developmentSourcePath: String?
  @Field var enabledComponents: [String] = []
  @Field var host = ""
  @Field var name = ""
  @Field var password = ""
  @Field var port = 22
  @Field var username = ""
}

private struct SshComponentInspectionResult: Record {
  @Field var id = ""
  @Field var state = ""
  @Field var version: String?
}

private struct SshInspectionResult: Record {
  @Field var automaticStartAvailable = true
  @Field var components: [SshComponentInspectionResult] = []
  @Field var computerName = ""
  @Field var sessionId = ""
}

private struct SshRecoveryInput: Record {
  @Field var host = ""
  @Field var port = 22
  @Field var recoveryKeyId = ""
  @Field var username = ""
}

private struct SshRecoveryResult: Record {
  @Field var hostReady = false
}

private final class SshBootstrapException: Exception, @unchecked Sendable {
  private let message: String

  init(name: String, reason: String) {
    self.message = reason
    super.init(name: name, description: reason)
  }

  override var reason: String {
    message
  }
}

private enum KnownHostStore {
  private static let defaultsKey = "vibepad.sshKnownHosts.openSSH"

  static func trustedKey(host: String, port: Int) -> String? {
    load()[identity(host: host, port: port)]
  }

  static func trust(host: String, port: Int, key: String) {
    var hosts = load()
    hosts[identity(host: host, port: port)] = key
    UserDefaults.standard.set(hosts, forKey: defaultsKey)
  }

  static func fingerprint(_ openSshKey: String) -> String {
    let components = openSshKey.split(separator: " ")
    guard components.count >= 2,
      let keyData = Data(base64Encoded: String(components[1])) else {
      return "SHA256:invalid"
    }
    let digest = SHA256.hash(data: keyData)
    return "SHA256:\(Data(digest).base64EncodedString().replacingOccurrences(of: "=", with: ""))"
  }

  private static func identity(host: String, port: Int) -> String {
    "\(host.lowercased()):\(port)"
  }

  private static func load() -> [String: String] {
    UserDefaults.standard.dictionary(forKey: defaultsKey) as? [String: String] ?? [:]
  }
}

private enum RecoveryKeyStore {
  private static let service = "studio.peacockery.vibepad.ssh-recovery"

  static func create() throws -> (id: String, key: Curve25519.Signing.PrivateKey) {
    let id = UUID().uuidString.lowercased()
    let key = Curve25519.Signing.PrivateKey()
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      kSecAttrAccount as String: id,
      kSecAttrService as String: service,
      kSecValueData as String: key.rawRepresentation,
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw SshBootstrapException(
        name: "SshRecoveryKeyStorageFailed",
        reason: "Saving the automatic-start key failed with Keychain status \(status)."
      )
    }
    return (id, key)
  }

  static func load(id: String) throws -> Curve25519.Signing.PrivateKey {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: id,
      kSecAttrService as String: service,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else {
      throw SshBootstrapException(
        name: "SshRecoveryKeyUnavailable",
        reason: "The automatic-start key is unavailable on this device."
      )
    }
    return try Curve25519.Signing.PrivateKey(rawRepresentation: data)
  }

  static func delete(id: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: id,
      kSecAttrService as String: service,
    ]
    SecItemDelete(query as CFDictionary)
  }
}

private final class TofuHostKeyValidator: NIOSSHClientServerAuthenticationDelegate {
  private let host: String
  private let port: Int

  init(host: String, port: Int) {
    self.host = host
    self.port = port
  }

  func validateHostKey(
    hostKey: NIOSSHPublicKey,
    validationCompletePromise: EventLoopPromise<Void>
  ) {
    let presented = String(openSSHPublicKey: hostKey)
    if let trusted = KnownHostStore.trustedKey(host: host, port: port) {
      guard trusted == presented else {
        validationCompletePromise.fail(
          SshBootstrapException(
            name: "SshHostKeyChanged",
            reason: "The SSH identity for \(host) changed. Expected \(KnownHostStore.fingerprint(trusted)); received \(KnownHostStore.fingerprint(presented))."
          )
        )
        return
      }
      validationCompletePromise.succeed(())
      return
    }
    KnownHostStore.trust(host: host, port: port, key: presented)
    validationCompletePromise.succeed(())
  }
}

public final class VibePadSshBootstrapModule: Module {
  private static let installerCommandPrefix =
    "curl -fsSL https://vibepad.peacockery.studio/downloads/host/install.sh | bash -s -- --yes --allow-unauthenticated"
  private static let inspectionCommand = #"""
    set -eu
    computer_name="$(scutil --get ComputerName 2>/dev/null || hostname -s 2>/dev/null || hostname 2>/dev/null || cat /proc/sys/kernel/hostname 2>/dev/null || printf 'computer')"
    computer_name="$(printf '%s' "$computer_name" | tr '\t\r\n' '   ')"
    printf 'VIBEPAD_COMPUTER\t%s\n' "$computer_name"
    if [ -f "$HOME/Library/LaunchAgents/studio.peacockery.vibepad.host.plist" ] || [ -f "$HOME/.config/systemd/user/vibepad-host.service" ]; then
      printf 'VIBEPAD_COMPONENT\tvibepad-host\tinstalled-ready\t\n'
    else
      printf 'VIBEPAD_COMPONENT\tvibepad-host\tmissing-install-selected\t\n'
    fi
    inspect_tool() {
      component_id="$1"
      binary_name="$2"
      darwin_managed="$HOME/Library/Application Support/VibePad/tools/node_modules/.bin/$binary_name"
      linux_managed="$HOME/.local/share/vibepad/tools/node_modules/.bin/$binary_name"
      executable="$(command -v "$binary_name" 2>/dev/null || true)"
      if [ -z "$executable" ] && [ -x "$darwin_managed" ]; then executable="$darwin_managed"; fi
      if [ -z "$executable" ] && [ -x "$linux_managed" ]; then executable="$linux_managed"; fi
      if [ -n "$executable" ]; then
        version="$("$executable" --version 2>&1 | head -n 1 | tr '\t\r\n' '   ')"
        printf 'VIBEPAD_COMPONENT\t%s\tinstalled-ready\t%s\n' "$component_id" "$version"
      else
        printf 'VIBEPAD_COMPONENT\t%s\tmissing-install-selected\t\n' "$component_id"
      fi
    }
    inspect_tool codex codex
    inspect_tool opencode opencode
    inspect_tool browser-tools agent-browser
    """#
  private static let invitationPattern = #"Invitation:\s+(vibepad://pair\?\S+)"#
  private static let recoveryProvisionedMarker = "VIBEPAD_RECOVERY_PROVISIONED"
  private static let recoveryReadyMarker = "VIBEPAD_RECOVERY_READY"

  public func definition() -> ModuleDefinition {
    Name("VibePadSshBootstrap")

    AsyncFunction("inspectAsync") { (input: SshBootstrapInput) -> SshInspectionResult in
      try Self.validate(input)
      let host = input.host.trimmingCharacters(in: .whitespacesAndNewlines)
      let username = input.username.trimmingCharacters(in: .whitespacesAndNewlines)
      let settings = SSHClientSettings(
        host: host,
        port: input.port,
        authenticationMethod: {
          .passwordBased(username: username, password: input.password)
        },
        hostKeyValidator: .custom(TofuHostKeyValidator(host: host, port: input.port))
      )
      do {
        let client = try await SSHClient.connect(to: settings)
        do {
          var output = try await client.executeCommand(
            Self.inspectionCommand,
            maxResponseSize: 262_144,
            mergeStreams: true
          )
          let text = output.readString(length: output.readableBytes) ?? ""
          try await client.close()
          return try Self.inspection(from: text)
        } catch {
          try? await client.close()
          throw error
        }
      } catch {
        throw Self.userFacingError(error, host: host)
      }
    }

    AsyncFunction("installAndPairAsync") { (input: SshInstallAndPairInput) -> SshBootstrapResult in
      let connectionInput = SshBootstrapInput()
      connectionInput.host = input.host
      connectionInput.password = input.password
      connectionInput.port = input.port
      connectionInput.username = input.username
      try Self.validate(connectionInput)
      try Self.validateSelection(input.enabledComponents)
      let host = input.host.trimmingCharacters(in: .whitespacesAndNewlines)
      let username = input.username.trimmingCharacters(in: .whitespacesAndNewlines)
      let settings = SSHClientSettings(
        host: host,
        port: input.port,
        authenticationMethod: {
          .passwordBased(username: username, password: input.password)
        },
        hostKeyValidator: .custom(TofuHostKeyValidator(host: host, port: input.port))
      )
      do {
        let client = try await SSHClient.connect(to: settings)
        var recoveryKeyId: String?
        do {
          var output = try await client.executeCommand(
            Self.installerCommand(
              developmentSourcePath: input.developmentSourcePath,
              enabledComponents: input.enabledComponents
            ),
            maxResponseSize: 2_097_152,
            mergeStreams: true
          )
          let text = output.readString(length: output.readableBytes) ?? ""
          if input.automaticStart {
            let recovery = try RecoveryKeyStore.create()
            recoveryKeyId = recovery.id
            do {
              var recoveryOutput = try await client.executeCommand(
                Self.recoveryProvisioningCommand(
                  keyId: recovery.id,
                  publicKey: Self.openSshPublicKey(recovery.key.publicKey)
                ),
                maxResponseSize: 262_144,
                mergeStreams: true
              )
              let recoveryText =
                recoveryOutput.readString(length: recoveryOutput.readableBytes) ?? ""
              guard recoveryText.contains(Self.recoveryProvisionedMarker) else {
                throw SshBootstrapException(
                  name: "SshRecoveryProvisioningFailed",
                  reason: "The computer finished setup before authorizing automatic startup."
                )
              }
            } catch {
              RecoveryKeyStore.delete(id: recovery.id)
              recoveryKeyId = nil
              throw error
            }
          }
          try await client.close()
          let result = SshBootstrapResult()
          result.invitationUrl = try Self.invitationUrl(from: text)
          result.recoveryKeyId = recoveryKeyId
          return result
        } catch {
          try? await client.close()
          throw error
        }
      } catch {
        throw Self.userFacingError(error, host: host)
      }
    }

    AsyncFunction("recoverHostAsync") { (input: SshRecoveryInput) -> SshRecoveryResult in
      try Self.validateRecovery(input)
      let host = input.host.trimmingCharacters(in: .whitespacesAndNewlines)
      let username = input.username.trimmingCharacters(in: .whitespacesAndNewlines)
      let key = try RecoveryKeyStore.load(id: input.recoveryKeyId)
      let settings = SSHClientSettings(
        host: host,
        port: input.port,
        authenticationMethod: { .ed25519(username: username, privateKey: key) },
        hostKeyValidator: .custom(TofuHostKeyValidator(host: host, port: input.port))
      )
      do {
        let client = try await SSHClient.connect(to: settings)
        do {
          var output = try await client.executeCommand(
            "vibepad-host recover",
            maxResponseSize: 262_144,
            mergeStreams: true
          )
          let text = output.readString(length: output.readableBytes) ?? ""
          try await client.close()
          let result = SshRecoveryResult()
          result.hostReady = text.contains(Self.recoveryReadyMarker)
          return result
        } catch {
          try? await client.close()
          throw error
        }
      } catch {
        throw Self.userFacingRecoveryError(error, host: host)
      }
    }
  }

  private static func openSshPublicKey(_ key: Curve25519.Signing.PublicKey) -> String {
    var blob = Data()
    appendSshField(Data("ssh-ed25519".utf8), to: &blob)
    appendSshField(key.rawRepresentation, to: &blob)
    return "ssh-ed25519 \(blob.base64EncodedString())"
  }

  private static func appendSshField(_ field: Data, to data: inout Data) {
    var length = UInt32(field.count).bigEndian
    withUnsafeBytes(of: &length) { data.append(contentsOf: $0) }
    data.append(field)
  }

  private static func recoveryProvisioningCommand(keyId: String, publicKey: String) -> String {
    #"""
    set -eu
    recovery_dir="$HOME/.vibepad"
    recovery_script="$recovery_dir/recover-host"
    authorized_keys="$HOME/.ssh/authorized_keys"
    mkdir -p "$recovery_dir" "$HOME/.ssh"
    chmod 700 "$recovery_dir" "$HOME/.ssh"
    cat > "$recovery_script" <<'VIBEPAD_RECOVERY_SCRIPT'
    #!/bin/sh
    set -eu
    case "$(uname -s)" in
      Darwin)
        launchctl kickstart "gui/$(id -u)/studio.peacockery.vibepad.host"
        ;;
      Linux)
        export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
        export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
        systemctl --user start vibepad-host.service
        ;;
      *)
        exit 1
        ;;
    esac
    printf 'VIBEPAD_RECOVERY_READY\n'
    VIBEPAD_RECOVERY_SCRIPT
    chmod 700 "$recovery_script"
    touch "$authorized_keys"
    if grep -q ' vibepad-recovery:' "$authorized_keys"; then
      grep -v ' vibepad-recovery:' "$authorized_keys" > "$authorized_keys.vibepad-tmp" || true
      mv "$authorized_keys.vibepad-tmp" "$authorized_keys"
    fi
    chmod 600 "$authorized_keys"
    printf '%s\n' 'restrict,command="$HOME/.vibepad/recover-host" \#(publicKey) vibepad-recovery:\#(keyId)' >> "$authorized_keys"
    printf 'VIBEPAD_RECOVERY_PROVISIONED\n'
    """#
  }

  private static func installerCommand(
    developmentSourcePath: String?,
    enabledComponents: [String]
  ) throws -> String {
    var flags: [String] = []
    if !enabledComponents.contains("codex") { flags.append("--without-codex") }
    if !enabledComponents.contains("opencode") { flags.append("--without-opencode") }
    if !enabledComponents.contains("browser-tools") { flags.append("--without-browser") }
    #if DEBUG
    if let developmentSourcePath,
      !developmentSourcePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      let source = shellQuote(developmentSourcePath)
      let installer = "bash \(source)/scripts/install-host.sh --yes --allow-unauthenticated --source \(source)"
      return ([installer] + flags).joined(separator: " ")
    }
    #endif
    return ([installerCommandPrefix] + flags).joined(separator: " ")
  }

  private static func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\\\"'\\\"'"))'"
  }

  private static func inspection(from output: String) throws -> SshInspectionResult {
    let result = SshInspectionResult()
    result.sessionId = UUID().uuidString.lowercased()
    for line in output.split(whereSeparator: \.isNewline) {
      let fields = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      if fields.first == "VIBEPAD_COMPUTER", fields.count >= 2 {
        result.computerName = fields[1]
      } else if fields.first == "VIBEPAD_COMPONENT", fields.count >= 3 {
        let component = SshComponentInspectionResult()
        component.id = fields[1]
        component.state = fields[2]
        if fields.count >= 4, !fields[3].isEmpty { component.version = fields[3] }
        result.components.append(component)
      }
    }
    guard !result.computerName.isEmpty, result.components.count == 4 else {
      throw SshBootstrapException(
        name: "SshInspectionInvalid",
        reason: "SSH connected, but the computer returned an incomplete VibePad inspection."
      )
    }
    return result
  }

  private static func validateSelection(_ enabledComponents: [String]) throws {
    let allowed = Set(["vibepad-host", "codex", "opencode", "browser-tools"])
    guard Set(enabledComponents).isSubset(of: allowed),
      enabledComponents.contains("vibepad-host"),
      enabledComponents.contains("codex") || enabledComponents.contains("opencode") else {
      throw SshBootstrapException(
        name: "SshSelectionInvalid",
        reason: "Select VibePad Host and at least one Codex or OpenCode provider."
      )
    }
  }

  private static func invitationUrl(from output: String) throws -> String {
    let regex = try NSRegularExpression(pattern: invitationPattern)
    let range = NSRange(output.startIndex..<output.endIndex, in: output)
    guard let match = regex.firstMatch(in: output, range: range),
      let valueRange = Range(match.range(at: 1), in: output) else {
      throw SshBootstrapException(
        name: "SshBootstrapMissingInvitation",
        reason: "VibePad Host finished setup without returning a pairing invitation."
      )
    }
    return String(output[valueRange])
  }

  private static func validate(_ input: SshBootstrapInput) throws {
    guard !input.host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw SshBootstrapException(name: "SshHostRequired", reason: "Enter the computer address.")
    }
    guard !input.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw SshBootstrapException(name: "SshUsernameRequired", reason: "Enter the SSH user.")
    }
    guard !input.password.isEmpty else {
      throw SshBootstrapException(name: "SshPasswordRequired", reason: "Enter the SSH password.")
    }
    guard (1...65_535).contains(input.port) else {
      throw SshBootstrapException(name: "SshPortInvalid", reason: "Enter a valid SSH port.")
    }
  }

  private static func validateRecovery(_ input: SshRecoveryInput) throws {
    guard !input.host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      !input.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      !input.recoveryKeyId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      (1...65_535).contains(input.port) else {
      throw SshBootstrapException(
        name: "SshRecoveryInputInvalid",
        reason: "The saved automatic-start connection is incomplete."
      )
    }
  }

  private static func userFacingError(_ error: Error, host: String) -> Error {
    guard let sshError = error as? SSHClientError else {
      return error
    }
    switch sshError {
    case .allAuthenticationOptionsFailed:
      return SshBootstrapException(
        name: "SshAuthenticationFailed",
        reason: "SSH sign-in failed. Check the user and password for \(host)."
      )
    case .unsupportedPasswordAuthentication:
      return SshBootstrapException(
        name: "SshPasswordAuthenticationUnavailable",
        reason: "\(host) does not accept SSH password sign-in. Use an existing VibePad computer with key-based SSH."
      )
    case .channelCreationFailed:
      return SshBootstrapException(
        name: "SshSetupSessionFailed",
        reason: "SSH connected to \(host), but VibePad could not open a setup session."
      )
    case .unsupportedHostBasedAuthentication, .unsupportedPrivateKeyAuthentication:
      return error
    }
  }

  private static func userFacingRecoveryError(_ error: Error, host: String) -> Error {
    guard let sshError = error as? SSHClientError else {
      return error
    }
    switch sshError {
    case .allAuthenticationOptionsFailed, .unsupportedPrivateKeyAuthentication:
      return SshBootstrapException(
        name: "SshRecoveryAuthenticationFailed",
        reason: "The saved automatic-start key was rejected by \(host). Set up this computer again to replace it."
      )
    case .channelCreationFailed:
      return SshBootstrapException(
        name: "SshRecoverySessionFailed",
        reason: "SSH reached \(host), and the Host startup session failed."
      )
    case .unsupportedPasswordAuthentication, .unsupportedHostBasedAuthentication:
      return error
    }
  }
}
