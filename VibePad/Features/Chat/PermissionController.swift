import Foundation

nonisolated enum PermissionController {
  static func fromPendingRequests(_ requests: [APIClient.PermissionRequest]) -> [PendingPermission] {
    requests.map { req in
      PendingPermission(
        sessionID: req.sessionID,
        permissionID: req.id,
        permission: req.permission,
        patterns: req.patterns ?? [],
        allowAlways: !(req.always ?? []).isEmpty,
        tool: req.permission,
        description: Self.describe(action: req.permission, resources: req.patterns ?? [])
      )
    }
  }

  /// Parses a `permission.v2.asked` event:
  /// `{id, sessionID, action, resources, save, metadata?, source?}`.
  static func parseAskedEvent(properties: [String: AnyCodable]) -> PendingPermission? {
    let raw: [String: Any] = properties.mapValues { $0.value }

    guard let sessionID = raw["sessionID"] as? String else { return nil }
    guard let permissionID = raw["id"] as? String else { return nil }

    let action = raw["action"] as? String
    let resources = (raw["resources"] as? [Any])?.compactMap { $0 as? String } ?? []
    let save = (raw["save"] as? [Any])?.compactMap { $0 as? String } ?? []

    return PendingPermission(
      sessionID: sessionID,
      permissionID: permissionID,
      permission: action,
      patterns: resources,
      allowAlways: !save.isEmpty,
      tool: action,
      description: describe(action: action, resources: resources)
    )
  }

  private static func describe(action: String?, resources: [String]) -> String {
    guard let action, !action.isEmpty else { return "Permission required" }
    guard let resource = resources.first, !resource.isEmpty else { return action }
    return "\(action): \(resource)"
  }

  /// Handles `permission.v2.replied`: `{sessionID, requestID, reply}`.
  static func applyRepliedEvent(properties: [String: AnyCodable], to permissions: inout [PendingPermission]) {
    guard let sessionID = properties["sessionID"]?.value as? String else { return }
    let permissionID =
      (properties["requestID"]?.value as? String)
      ?? (properties["permissionID"]?.value as? String)
      ?? (properties["id"]?.value as? String)
    guard let permissionID else { return }
    permissions.removeAll { $0.sessionID == sessionID && $0.permissionID == permissionID }
  }
}
