import Foundation

/// Durable owner for host metadata and its associated credentials.
struct HostProfileRepository {
  private let defaults: UserDefaults
  private let secrets: any SecretStoring

  private let profilesKey = "hostProfiles.v1"
  private let selectedProfileKey = "currentHostProfileID.v1"

  init(defaults: UserDefaults = .standard, secrets: any SecretStoring = KeychainSecretStore.standard) {
    self.defaults = defaults
    self.secrets = secrets
  }

  func loadProfiles() -> [HostProfile]? {
    guard let data = defaults.data(forKey: profilesKey) else { return nil }
    return try? JSONDecoder().decode([HostProfile].self, from: data)
  }

  func saveProfiles(_ profiles: [HostProfile]) {
    guard !profiles.isEmpty, let data = try? JSONEncoder().encode(profiles) else { return }
    defaults.set(data, forKey: profilesKey)
  }

  func selectedProfileID(validIn profiles: [HostProfile]) -> UUID? {
    guard let raw = defaults.string(forKey: selectedProfileKey),
      let id = UUID(uuidString: raw), profiles.contains(where: { $0.id == id })
    else { return nil }
    return id
  }

  func saveSelectedProfileID(_ id: UUID) {
    defaults.set(id.uuidString, forKey: selectedProfileKey)
  }

  func savePassword(_ password: String, id: String) {
    if password.isEmpty {
      secrets.delete(id)
    } else {
      secrets.save(password, forKey: id)
    }
  }

  func password(id: String) -> String? {
    secrets.load(forKey: id)
  }

  func deletePassword(id: String) {
    secrets.delete(id)
  }
}
