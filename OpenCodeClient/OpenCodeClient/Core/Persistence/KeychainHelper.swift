//
//  KeychainHelper.swift
//  OpenCodeClient
//

import Foundation
import Security

/// Minimal Keychain helper for storing sensitive credentials (e.g. password).
/// Uses kSecClassGenericPassword with service = bundle ID, account = key.
nonisolated enum KeychainHelper {
  private static var service: String {
    Bundle.main.bundleIdentifier ?? "com.opencode.client"
  }

  static func save(_ value: String, forKey key: String) {
    guard let data = value.data(using: .utf8) else { return }
    save(data, forKey: key)
  }

  static func save(_ data: Data, forKey key: String) {
    delete(key)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecValueData as String: data,
    ]
    SecItemAdd(query as CFDictionary, nil)
  }

  static func load(forKey key: String) -> String? {
    guard let data = loadData(forKey: key) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func loadData(forKey key: String) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return data
  }

  static func delete(_ key: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
