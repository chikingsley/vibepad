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
        tool: nil,
        description: req.permission ?? "Permission required"
      )
    }
  }

  static func parseAskedEvent(properties: [String: AnyCodable]) -> PendingPermission? {
    let rawProps: [String: Any] = properties.mapValues { $0.value }
    let requestObj = (rawProps["request"] as? [String: Any]) ?? rawProps

    func readString(_ key: String) -> String? {
      (requestObj[key] as? String) ?? (rawProps[key] as? String)
    }

    guard let sessionID = readString("sessionID") else { return nil }
    guard let permissionID = readString("permissionID") ?? readString("id") else { return nil }

    let permission = requestObj["permission"] as? String
    let allowAlways: Bool = {
      if let b = requestObj["always"] as? Bool { return b }
      if let arr = requestObj["always"] as? [String] { return !arr.isEmpty }
      if let arr = requestObj["always"] as? [Any] { return !arr.isEmpty }
      return false
    }()

    let patterns: [String] = {
      if let arr = requestObj["patterns"] as? [String] { return arr }
      if let anyArr = requestObj["patterns"] as? [Any] { return anyArr.compactMap { $0 as? String } }
      return []
    }()

    let tool: String? = {
      if let t = requestObj["tool"] as? String { return t }
      if let t = requestObj["tool"] as? [String: Any] {
        return (t["name"] as? String)
          ?? (t["tool"] as? String)
          ?? (t["id"] as? String)
      }
      return nil
    }()

    let description =
      (requestObj["description"] as? String)
      ?? tool
      ?? permission
      ?? "Permission required"

    return PendingPermission(
      sessionID: sessionID,
      permissionID: permissionID,
      permission: permission,
      patterns: patterns,
      allowAlways: allowAlways,
      tool: tool,
      description: description
    )
  }

  static func applyRepliedEvent(properties: [String: AnyCodable], to permissions: inout [PendingPermission]) {
    guard let sessionID = properties["sessionID"]?.value as? String else { return }
    let permissionID = (properties["permissionID"]?.value as? String) ?? (properties["id"]?.value as? String)
    guard let permissionID else { return }
    permissions.removeAll { $0.sessionID == sessionID && $0.permissionID == permissionID }
  }
}
