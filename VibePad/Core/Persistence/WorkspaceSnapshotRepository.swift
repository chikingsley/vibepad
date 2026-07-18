import Foundation

/// Codable persistence boundary for local workspace restoration state.
struct WorkspaceSnapshotRepository {
  private let defaults: UserDefaults?

  init(defaults: UserDefaults?) {
    self.defaults = defaults
  }

  func load<Value: Decodable>(_ type: Value.Type, key: String) -> Value? {
    guard let data = defaults?.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(type, from: data)
  }

  func save<Value: Encodable>(_ value: Value, key: String) {
    guard let data = try? JSONEncoder().encode(value) else { return }
    defaults?.set(data, forKey: key)
  }
}
