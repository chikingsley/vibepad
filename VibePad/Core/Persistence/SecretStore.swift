import Foundation
import Security

nonisolated protocol SecretStoring: Sendable {
  func save(_ value: String, forKey key: String)
  func save(_ data: Data, forKey key: String)
  func load(forKey key: String) -> String?
  func loadData(forKey key: String) -> Data?
  func delete(_ key: String)
}

/// Keychain-backed owner for passwords, private keys, and future credentials.
nonisolated struct KeychainSecretStore: SecretStoring {
  static let standard = KeychainSecretStore()

  private var service: String {
    Bundle.main.bundleIdentifier ?? "com.vibepad.app"
  }

  func save(_ value: String, forKey key: String) {
    guard let data = value.data(using: .utf8) else { return }
    save(data, forKey: key)
  }

  func save(_ data: Data, forKey key: String) {
    delete(key)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecValueData as String: data,
    ]
    SecItemAdd(query as CFDictionary, nil)
  }

  func load(forKey key: String) -> String? {
    loadData(forKey: key).flatMap { String(data: $0, encoding: .utf8) }
  }

  func loadData(forKey key: String) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess else { return nil }
    return result as? Data
  }

  func delete(_ key: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
