//
//  APIClient.swift
//  VibePad
//

import Foundation
import os

nonisolated struct OpenCodeScope: Equatable, Hashable, Sendable {
  let directory: String?
  let workspace: String?

  init(directory: String? = nil, workspace: String? = nil) {
    self.directory = Self.cleaned(directory)
    self.workspace = Self.cleaned(workspace)
  }

  var isEmpty: Bool {
    directory == nil && workspace == nil
  }

  func applying(to queryItems: [URLQueryItem]) -> [URLQueryItem] {
    guard !isEmpty else { return queryItems }

    var result = queryItems
    let existingNames = Set(result.map(\.name))
    if let directory, !existingNames.contains("directory") {
      result.append(URLQueryItem(name: "directory", value: directory))
    }
    if let workspace, !existingNames.contains("workspace") {
      result.append(URLQueryItem(name: "workspace", value: workspace))
    }
    return result
  }

  /// v2 `/api/*` endpoints take the scope as a deepObject `location`
  /// query parameter: `location[directory]=…&location[workspace]=…`.
  func applyingV2Location(to queryItems: [URLQueryItem]) -> [URLQueryItem] {
    guard !isEmpty else { return queryItems }

    var result = queryItems
    let existingNames = Set(result.map(\.name))
    if let directory, !existingNames.contains("location[directory]") {
      result.append(URLQueryItem(name: "location[directory]", value: directory))
    }
    if let workspace, !existingNames.contains("location[workspace]") {
      result.append(URLQueryItem(name: "location[workspace]", value: workspace))
    }
    return result
  }

  private static func cleaned(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

/// Talks to an OpenCode server. The session runtime (health, messages,
/// prompt/interrupt, permissions, questions, agents, commands, file
/// browsing) uses the v2 `/api/*` surface. Session management (list,
/// create, rename, archive, delete, fork, revert), projects, session
/// status/diff/todos, MCP, and provider limits stay on legacy routes
/// because v2 does not cover them yet (experimental v0.0.1 — see
/// docs/OpenCode_API_v2_Audit.md).
actor APIClient {
  private static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "VibePad",
    category: "APIClient"
  )

  private var baseURL: String
  private var username: String?
  private var password: String?

  // Default to localhost to avoid leaking a personal LAN IP in open source repos.
  nonisolated static let defaultServer = "127.0.0.1:4096"

  init(baseURL: String = APIClient.defaultServer, username: String? = nil, password: String? = nil) {
    self.baseURL = baseURL.hasPrefix("http") ? baseURL : "http://\(baseURL)"
    self.username = username
    self.password = password
  }

  func configure(baseURL: String, username: String? = nil, password: String? = nil) {
    self.baseURL = baseURL.hasPrefix("http") ? baseURL : "http://\(baseURL)"
    self.username = username
    self.password = password
  }

  /// How an `OpenCodeScope` is encoded onto the request URL.
  enum ScopeEncoding {
    /// Legacy endpoints: `?directory=…&workspace=…`
    case directoryQuery
    /// v2 `/api/*` endpoints: `?location[directory]=…&location[workspace]=…`
    case v2Location
  }

  private func makeRequest(
    path: String,
    method: String = "GET",
    queryItems: [URLQueryItem]? = nil,
    scope: OpenCodeScope? = nil,
    scopeEncoding: ScopeEncoding = .directoryQuery,
    body: Data? = nil
  ) async throws -> (Data, URLResponse) {
    guard var components = URLComponents(string: "\(baseURL)\(path)") else {
      throw APIError.invalidURL
    }
    let scopedQueryItems: [URLQueryItem] = {
      guard let scope else { return queryItems ?? [] }
      switch scopeEncoding {
      case .directoryQuery: return scope.applying(to: queryItems ?? [])
      case .v2Location: return scope.applyingV2Location(to: queryItems ?? [])
      }
    }()
    if !scopedQueryItems.isEmpty {
      components.queryItems = scopedQueryItems
    }
    guard let url = components.url else {
      throw APIError.invalidURL
    }

    guard url.scheme != nil else {
      throw APIError.invalidURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    if let username, let password {
      let credential = "\(username):\(password)"
      if let data = credential.data(using: .utf8) {
        let encoded = data.base64EncodedString()
        request.setValue("Basic \(encoded)", forHTTPHeaderField: "Authorization")
      }
    }

    if let body {
      request.httpBody = body
    }

    let (data, response) = try await URLSession.shared.data(for: request)
    if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
      throw APIError.httpError(statusCode: http.statusCode, data: data)
    }
    return (data, response)
  }

  func health() async throws -> HealthResponse {
    let (data, _) = try await makeRequest(path: "/api/health")
    let v2 = try JSONDecoder().decode(HealthResponse.self, from: data)
    guard v2.version == nil else { return v2 }
    // /api/health does not report a version yet; fetch it from the legacy
    // health endpoint for the Settings/Hosts diagnostics display.
    let version: String? = await {
      guard let (legacyData, _) = try? await makeRequest(path: "/global/health") else { return nil }
      return (try? JSONDecoder().decode(HealthResponse.self, from: legacyData))?.version
    }()
    return HealthResponse(healthy: v2.healthy, version: version)
  }

  func projects(scope: OpenCodeScope? = nil) async throws -> [Project] {
    let (data, _) = try await makeRequest(path: "/project", scope: scope)
    return try JSONDecoder().decode([Project].self, from: data)
  }

  func projectCurrent(scope: OpenCodeScope? = nil) async throws -> Project? {
    let (data, _) = try await makeRequest(path: "/project/current", scope: scope)
    return try? JSONDecoder().decode(Project.self, from: data)
  }

  func serverPaths() async throws -> ServerPathInfo {
    let (data, _) = try await makeRequest(path: "/path")
    return try JSONDecoder().decode(ServerPathInfo.self, from: data)
  }

  func sessions(scope: OpenCodeScope? = nil, limit: Int = 100) async throws -> [Session] {
    var queryItems: [URLQueryItem] = []
    if limit > 0 {
      queryItems.append(URLQueryItem(name: "limit", value: String(limit)))
    }
    let (data, _) = try await makeRequest(
      path: "/session",
      queryItems: queryItems.isEmpty ? nil : queryItems,
      scope: scope
    )
    return try JSONDecoder().decode([Session].self, from: data)
  }

  func session(sessionID: String, scope: OpenCodeScope? = nil) async throws -> Session {
    let (data, _) = try await makeRequest(path: "/session/\(sessionID)", scope: scope)
    return try JSONDecoder().decode(Session.self, from: data)
  }

  func createSession(title: String? = nil, scope: OpenCodeScope? = nil) async throws -> Session {
    let body = title.map { ["title": $0] } ?? [:]
    let data = try JSONEncoder().encode(body)
    let (responseData, _) = try await makeRequest(path: "/session", method: "POST", scope: scope, body: data)
    return try JSONDecoder().decode(Session.self, from: responseData)
  }

  func updateSession(sessionID: String, title: String, scope: OpenCodeScope? = nil) async throws -> Session {
    let body = ["title": title]
    let data = try JSONEncoder().encode(body)
    let (responseData, _) = try await makeRequest(
      path: "/session/\(sessionID)", method: "PATCH", scope: scope, body: data)
    return try JSONDecoder().decode(Session.self, from: responseData)
  }

  func updateSessionArchived(sessionID: String, archived: Int, scope: OpenCodeScope? = nil) async throws -> Session {
    struct Body: Encodable {
      struct Time: Encodable {
        let archived: Int
      }

      let time: Time
    }

    let data = try JSONEncoder().encode(Body(time: .init(archived: archived)))
    let (responseData, _) = try await makeRequest(
      path: "/session/\(sessionID)", method: "PATCH", scope: scope, body: data)
    return try JSONDecoder().decode(Session.self, from: responseData)
  }

  func deleteSession(sessionID: String, scope: OpenCodeScope? = nil) async throws {
    _ = try await makeRequest(path: "/session/\(sessionID)", method: "DELETE", scope: scope)
  }

  func messages(sessionID: String, limit: Int? = nil, scope: OpenCodeScope? = nil) async throws -> [MessageWithParts] {
    var queryItems: [URLQueryItem] = [URLQueryItem(name: "order", value: "desc")]
    if let limit, limit > 0 {
      queryItems.append(URLQueryItem(name: "limit", value: String(limit)))
    }
    let (data, _) = try await makeRequest(path: "/api/session/\(sessionID)/message", queryItems: queryItems)
    let response = try JSONDecoder().decode(V2API.SessionMessagesResponse.self, from: data)
    // The v2 projection returns newest-first; the chat renders oldest-first.
    return response.data
      .reversed()
      .compactMap { $0.toMessageWithParts(sessionID: sessionID) }
  }

  /// v2 keeps the session's model/agent as session state instead of
  /// per-prompt parameters, so a send is: set model, set agent, prompt.
  func promptAsync(
    sessionID: String,
    text: String,
    attachments: [ComposerImageAttachment] = [],
    agent: String = "build",
    model: Message.ModelInfo?,
    scope: OpenCodeScope? = nil
  ) async throws {
    if let model {
      struct ModelBody: Encodable {
        let model: V2API.ModelRef
      }
      let body = try JSONEncoder().encode(ModelBody(model: .init(id: model.modelID, providerID: model.providerID)))
      _ = try await makeRequest(path: "/api/session/\(sessionID)/model", method: "POST", body: body)
    }

    struct AgentBody: Encodable {
      let agent: String
    }
    let agentBody = try JSONEncoder().encode(AgentBody(agent: agent))
    _ = try await makeRequest(path: "/api/session/\(sessionID)/agent", method: "POST", body: agentBody)

    let files = attachments.map { V2API.PromptBody.FileInput(uri: $0.dataURL, name: $0.filename) }
    let body = V2API.PromptBody(
      prompt: V2API.PromptBody.PromptInput(text: text, files: files.isEmpty ? nil : files)
    )
    let bodyData = try JSONEncoder().encode(body)
    _ = try await makeRequest(
      path: "/api/session/\(sessionID)/prompt",
      method: "POST",
      body: bodyData
    )
  }

  func abort(sessionID: String, scope: OpenCodeScope? = nil) async throws {
    _ = try await makeRequest(path: "/api/session/\(sessionID)/interrupt", method: "POST")
  }

  func sessionStatus(scope: OpenCodeScope? = nil) async throws -> [String: SessionStatus] {
    let (data, _) = try await makeRequest(path: "/session/status", scope: scope)
    return try JSONDecoder().decode([String: SessionStatus].self, from: data)
  }

  nonisolated enum PermissionResponse: String, Encodable, Sendable {
    case once
    case always
    case reject
  }

  nonisolated struct PermissionRequest: Codable, Identifiable, Sendable {
    nonisolated struct ToolRef: Codable, Sendable {
      let messageID: String?
      let callID: String?
    }

    nonisolated struct Metadata: Codable, Sendable {
      let filepath: String?
      let parentDir: String?
    }

    let id: String
    let sessionID: String
    let permission: String?
    let patterns: [String]?
    let metadata: Metadata?
    let always: [String]?
    let tool: ToolRef?
  }

  func pendingPermissions(scope: OpenCodeScope? = nil) async throws -> [PermissionRequest] {
    let (data, _) = try await makeRequest(
      path: "/api/permission/request", scope: scope, scopeEncoding: .v2Location)
    let response = try JSONDecoder().decode(V2API.DataEnvelope<[V2API.PermissionRequest]>.self, from: data)
    return response.data.map(\.asLegacyRequest)
  }

  func respondPermission(
    sessionID: String,
    permissionID: String,
    response: PermissionResponse,
    scope: OpenCodeScope? = nil
  ) async throws {
    struct Body: Encodable {
      let reply: PermissionResponse
    }
    let data = try JSONEncoder().encode(Body(reply: response))
    _ = try await makeRequest(
      path: "/api/session/\(sessionID)/permission/\(permissionID)/reply",
      method: "POST",
      body: data
    )
  }

  func pendingQuestions(scope: OpenCodeScope? = nil) async throws -> [QuestionRequest] {
    let (data, _) = try await makeRequest(
      path: "/api/question/request", scope: scope, scopeEncoding: .v2Location)
    return try JSONDecoder().decode(V2API.DataEnvelope<[QuestionRequest]>.self, from: data).data
  }

  func replyQuestion(
    sessionID: String, requestID: String, answers: [[String]], scope: OpenCodeScope? = nil
  )
    async throws
  {
    struct Body: Encodable {
      let answers: [[String]]
    }
    let data = try JSONEncoder().encode(Body(answers: answers))
    _ = try await makeRequest(
      path: "/api/session/\(sessionID)/question/\(requestID)/reply", method: "POST", body: data)
  }

  func rejectQuestion(sessionID: String, requestID: String, scope: OpenCodeScope? = nil) async throws {
    _ = try await makeRequest(
      path: "/api/session/\(sessionID)/question/\(requestID)/reject", method: "POST")
  }

  /// Stays on the legacy endpoint: the v2 `/api/model` catalog does not
  /// expose per-model context limits yet, which the context gauge needs.
  func providers(scope: OpenCodeScope? = nil) async throws -> ProvidersResponse {
    let (data, _) = try await makeRequest(path: "/config/providers", scope: scope)
    return try JSONDecoder().decode(ProvidersResponse.self, from: data)
  }

  func providerCatalog(scope: OpenCodeScope? = nil) async throws -> [V2API.Provider] {
    let (data, _) = try await makeRequest(path: "/api/provider", scope: scope, scopeEncoding: .v2Location)
    return try JSONDecoder().decode(V2API.DataEnvelope<[V2API.Provider]>.self, from: data).data
  }

  func modelCatalog(scope: OpenCodeScope? = nil) async throws -> [V2API.Model] {
    let (data, _) = try await makeRequest(path: "/api/model", scope: scope, scopeEncoding: .v2Location)
    return try JSONDecoder().decode(V2API.DataEnvelope<[V2API.Model]>.self, from: data).data
  }

  func agents(scope: OpenCodeScope? = nil) async throws -> [AgentInfo] {
    let (data, _) = try await makeRequest(path: "/api/agent", scope: scope, scopeEncoding: .v2Location)
    let response = try JSONDecoder().decode(V2API.DataEnvelope<[V2API.Agent]>.self, from: data)
    return response.data.map(\.asAgentInfo)
  }

  func commands(scope: OpenCodeScope? = nil) async throws -> [OpenCodeCommand] {
    let (data, _) = try await makeRequest(path: "/api/command", scope: scope, scopeEncoding: .v2Location)
    let response = try JSONDecoder().decode(V2API.DataEnvelope<[V2API.Command]>.self, from: data)
    return response.data.map(\.asOpenCodeCommand)
  }

  func mcpStatus(scope: OpenCodeScope? = nil) async throws -> [String: MCPStatus] {
    let (data, _) = try await makeRequest(path: "/mcp", scope: scope)
    return try JSONDecoder().decode([String: MCPStatus].self, from: data)
  }

  func addMCPServer(
    name: String, config: MCPServerConfig, scope: OpenCodeScope? = nil
  ) async throws -> [String: MCPStatus] {
    struct Body: Encodable {
      let name: String
      let config: MCPServerConfig
    }

    let body = try JSONEncoder().encode(Body(name: name, config: config))
    let (data, _) = try await makeRequest(path: "/mcp", method: "POST", scope: scope, body: body)
    return try JSONDecoder().decode([String: MCPStatus].self, from: data)
  }

  func toolIDs(scope: OpenCodeScope? = nil) async throws -> [String] {
    let (data, _) = try await makeRequest(path: "/experimental/tool/ids", scope: scope)
    return try JSONDecoder().decode([String].self, from: data)
  }

  func tools(providerID: String, modelID: String, scope: OpenCodeScope? = nil) async throws -> [ExperimentalTool] {
    let (data, _) = try await makeRequest(
      path: "/experimental/tool",
      queryItems: [
        URLQueryItem(name: "provider", value: providerID),
        URLQueryItem(name: "model", value: modelID),
      ],
      scope: scope
    )
    return try JSONDecoder().decode([ExperimentalTool].self, from: data)
  }

  func sessionDiff(sessionID: String, scope: OpenCodeScope? = nil) async throws -> [FileDiff] {
    let (data, _) = try await makeRequest(path: "/session/\(sessionID)/diff", scope: scope)
    return try JSONDecoder().decode([FileDiff].self, from: data)
  }

  func sessionTodos(sessionID: String, scope: OpenCodeScope? = nil) async throws -> [TodoItem] {
    let (data, _) = try await makeRequest(path: "/session/\(sessionID)/todo", scope: scope)
    return try JSONDecoder().decode([TodoItem].self, from: data)
  }

  func fileList(path: String = "", scope: OpenCodeScope? = nil) async throws -> [FileNode] {
    let queryItems = [URLQueryItem(name: "path", value: path)]
    let (data, _) = try await makeRequest(
      path: "/api/fs/list", queryItems: queryItems, scope: scope, scopeEncoding: .v2Location)
    let response = try JSONDecoder().decode(V2API.DataEnvelope<[V2API.FsEntry]>.self, from: data)
    return response.data.map(\.asFileNode)
  }

  func fileContent(path: String, scope: OpenCodeScope? = nil) async throws -> FileContent {
    // /api/fs/read/* takes the path in the URL and returns the raw bytes;
    // classify text-vs-binary by UTF-8 validity. Binary content (images)
    // is base64-encoded, matching what the file viewer expects.
    let escapedPath =
      path
      .split(separator: "/", omittingEmptySubsequences: true)
      .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
      .joined(separator: "/")
    let (data, _) = try await makeRequest(
      path: "/api/fs/read/\(escapedPath)", scope: scope, scopeEncoding: .v2Location)
    if let text = String(data: data, encoding: .utf8) {
      return FileContent(type: "text", content: text)
    }
    return FileContent(type: "binary", content: data.base64EncodedString())
  }

  func findFile(query: String, limit: Int = 50, scope: OpenCodeScope? = nil) async throws -> [String] {
    let (data, _) = try await makeRequest(
      path: "/api/fs/find",
      queryItems: [
        URLQueryItem(name: "query", value: query),
        URLQueryItem(name: "type", value: "file"),
        URLQueryItem(name: "limit", value: String(limit)),
      ],
      scope: scope,
      scopeEncoding: .v2Location
    )
    let response = try JSONDecoder().decode(V2API.DataEnvelope<[V2API.FsEntry]>.self, from: data)
    return response.data.map(\.path)
  }

  func fileStatus(scope: OpenCodeScope? = nil) async throws -> [FileStatusEntry] {
    let (data, _) = try await makeRequest(path: "/file/status", scope: scope)
    return try JSONDecoder().decode([FileStatusEntry].self, from: data)
  }

  func forkSession(sessionID: String, messageID: String? = nil, scope: OpenCodeScope? = nil) async throws -> Session {
    struct ForkBody: Encodable {
      let messageID: String?
    }
    let body = ForkBody(messageID: messageID)
    let data = try JSONEncoder().encode(body)
    let (responseData, _) = try await makeRequest(
      path: "/session/\(sessionID)/fork",
      method: "POST",
      scope: scope,
      body: data
    )
    return try JSONDecoder().decode(Session.self, from: responseData)
  }

  func revertSession(
    sessionID: String, messageID: String, partID: String? = nil, scope: OpenCodeScope? = nil
  ) async throws -> Session {
    struct RevertBody: Encodable {
      let messageID: String
      let partID: String?
    }

    let data = try JSONEncoder().encode(RevertBody(messageID: messageID, partID: partID))
    let (responseData, _) = try await makeRequest(
      path: "/session/\(sessionID)/revert",
      method: "POST",
      scope: scope,
      body: data
    )
    return try JSONDecoder().decode(Session.self, from: responseData)
  }
}

nonisolated struct FileNode: Codable, Identifiable, Sendable {
  var id: String { path }
  let name: String
  let path: String
  let absolute: String?
  let type: String  // "directory" | "file"
  let ignored: Bool?
}

nonisolated struct FileContent: Codable {
  let type: String  // "text" | "binary"
  let content: String?
  var text: String? { type == "text" ? content : nil }
}

nonisolated struct FileStatusEntry: Codable, Sendable {
  let path: String?
  let status: String?  // "added" | "modified" | "deleted" | "untracked"
}

nonisolated struct OpenCodeCommand: Codable, Identifiable, Hashable {
  var id: String { name }
  let name: String
  let description: String?
  let agent: String?
  let model: String?
  let source: String?
  let template: String
  let subtask: Bool?
  let hints: [String]

  private enum CodingKeys: String, CodingKey {
    case name, description, agent, model, source, template, subtask, hints
  }

  init(
    name: String, description: String?, agent: String?, model: String?, source: String?,
    template: String, subtask: Bool?, hints: [String]
  ) {
    self.name = name
    self.description = description
    self.agent = agent
    self.model = model
    self.source = source
    self.template = template
    self.subtask = subtask
    self.hints = hints
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    name = (try? c.decode(String.self, forKey: .name)) ?? ""
    description = try? c.decode(String.self, forKey: .description)
    agent = try? c.decode(String.self, forKey: .agent)
    model = try? c.decode(String.self, forKey: .model)
    source = try? c.decode(String.self, forKey: .source)
    template = (try? c.decode(String.self, forKey: .template)) ?? ""
    subtask = try? c.decode(Bool.self, forKey: .subtask)
    hints = (try? c.decode([String].self, forKey: .hints)) ?? []
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(name, forKey: .name)
    try c.encodeIfPresent(description, forKey: .description)
    try c.encodeIfPresent(agent, forKey: .agent)
    try c.encodeIfPresent(model, forKey: .model)
    try c.encodeIfPresent(source, forKey: .source)
    try c.encode(template, forKey: .template)
    try c.encodeIfPresent(subtask, forKey: .subtask)
    try c.encode(hints, forKey: .hints)
  }
}

nonisolated struct MCPStatus: Codable, Equatable {
  let status: String
  let error: String?
}

nonisolated enum MCPServerConfig: Encodable {
  case local(MCPLocalConfig)
  case remote(MCPRemoteConfig)

  func encode(to encoder: Encoder) throws {
    switch self {
    case .local(let config):
      try config.encode(to: encoder)
    case .remote(let config):
      try config.encode(to: encoder)
    }
  }
}

nonisolated struct MCPLocalConfig: Encodable {
  let type = "local"
  let command: [String]
  let cwd: String?
  let environment: [String: String]?
  let enabled: Bool?
  let timeout: Int?
}

nonisolated struct MCPRemoteConfig: Encodable {
  let type = "remote"
  let url: String
  let enabled: Bool?
  let headers: [String: String]?
  let oauth: AnyCodable?
  let timeout: Int?
}

nonisolated struct ExperimentalTool: Codable, Identifiable {
  let id: String
  let description: String
  let parameters: AnyCodable

  private enum CodingKeys: String, CodingKey {
    case id, description, parameters
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = (try? c.decode(String.self, forKey: .id)) ?? ""
    description = (try? c.decode(String.self, forKey: .description)) ?? ""
    parameters = (try? c.decode(AnyCodable.self, forKey: .parameters)) ?? AnyCodable([String: Any]())
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(id, forKey: .id)
    try c.encode(description, forKey: .description)
    try c.encode(parameters, forKey: .parameters)
  }
}

nonisolated struct FileDiff: Codable, Identifiable, Hashable, Sendable {
  var id: String { file }
  let file: String
  let before: String
  let after: String
  let additions: Int
  let deletions: Int
  let status: String?

  enum CodingKeys: String, CodingKey {
    case file, path, before, after, additions, deletions, status
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    file = (try? c.decode(String.self, forKey: .file)) ?? (try? c.decode(String.self, forKey: .path)) ?? ""
    before = (try? c.decode(String.self, forKey: .before)) ?? ""
    after = (try? c.decode(String.self, forKey: .after)) ?? ""
    additions = (try? c.decode(Int.self, forKey: .additions)) ?? 0
    deletions = (try? c.decode(Int.self, forKey: .deletions)) ?? 0
    status = try? c.decode(String.self, forKey: .status)
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(file, forKey: .file)
    try c.encode(before, forKey: .before)
    try c.encode(after, forKey: .after)
    try c.encode(additions, forKey: .additions)
    try c.encode(deletions, forKey: .deletions)
    try c.encodeIfPresent(status, forKey: .status)
  }

  init(file: String, before: String, after: String, additions: Int, deletions: Int, status: String?) {
    self.file = file
    self.before = before
    self.after = after
    self.additions = additions
    self.deletions = deletions
    self.status = status
  }

  func hash(into hasher: inout Hasher) { hasher.combine(file) }
  static func == (lhs: FileDiff, rhs: FileDiff) -> Bool { lhs.file == rhs.file }
}

/// OpenCode GET /config/providers
///
/// Server responses vary across versions:
/// - `providers` may be an array (`[{id, name, models}]`) or a dictionary (`{ providerID: ProviderInfo }`)
/// - `models` may be a dictionary (`{ modelID: ModelInfo }`) or an array (`[{id, ...}]`)
/// - `ProviderModel.id` / `ConfigProvider.id` may be missing when encoded as dictionary values
nonisolated struct ProvidersResponse: Decodable {
  let providers: [ConfigProvider]
  let `default`: DefaultProvider?

  private enum CodingKeys: String, CodingKey {
    case providers
    case `default`
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    `default` = try? c.decode(DefaultProvider.self, forKey: .default)

    if let arr = try? c.decode([ConfigProvider].self, forKey: .providers) {
      providers = arr
      return
    }

    if let dict = try? c.decode([String: ConfigProvider].self, forKey: .providers) {
      providers =
        dict
        .map { key, value in
          if !value.id.isEmpty { return value }
          return ConfigProvider(id: key, name: value.name, models: value.models)
        }
        .sorted { $0.id < $1.id }
      return
    }

    providers = []
  }
}

nonisolated struct ConfigProvider: Decodable {
  let id: String
  let name: String?
  let models: [String: ProviderModel]

  private enum CodingKeys: String, CodingKey {
    case id
    case name
    case models
  }

  init(id: String, name: String?, models: [String: ProviderModel]) {
    self.id = id
    self.name = name
    self.models = models
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = (try? c.decode(String.self, forKey: .id)) ?? ""
    name = try? c.decode(String.self, forKey: .name)
    if let dict = try? c.decode([String: ProviderModel].self, forKey: .models) {
      var fixed: [String: ProviderModel] = [:]
      fixed.reserveCapacity(dict.count)
      for (key, value) in dict {
        if value.id.isEmpty {
          fixed[key] = ProviderModel(id: key, name: value.name, providerID: value.providerID, limit: value.limit)
        } else {
          fixed[key] = value
        }
      }
      models = fixed
      return
    }

    if let arr = try? c.decode([ProviderModel].self, forKey: .models) {
      var fixed: [String: ProviderModel] = [:]
      fixed.reserveCapacity(arr.count)
      for m in arr {
        let key = m.id
        if key.isEmpty { continue }
        fixed[key] = m
      }
      models = fixed
      return
    }

    models = [:]
  }
}

nonisolated struct ProviderModel: Decodable {
  let id: String
  let name: String?
  let providerID: String?
  let limit: ProviderModelLimit?

  private enum CodingKeys: String, CodingKey {
    case id
    case name
    case providerID
    case providerId
    case limit
  }

  init(id: String, name: String?, providerID: String?, limit: ProviderModelLimit?) {
    self.id = id
    self.name = name
    self.providerID = providerID
    self.limit = limit
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = (try? c.decode(String.self, forKey: .id)) ?? ""
    name = try? c.decode(String.self, forKey: .name)
    providerID = (try? c.decode(String.self, forKey: .providerID)) ?? (try? c.decode(String.self, forKey: .providerId))
    limit = try? c.decode(ProviderModelLimit.self, forKey: .limit)
  }
}

nonisolated struct ProviderModelLimit: Codable {
  let context: Int?
  let input: Int?
  let output: Int?
}

nonisolated struct DefaultProvider: Codable {
  let providerID: String
  let modelID: String
  let modelsByProvider: [String: String]

  private enum CodingKeys: String, CodingKey {
    case providerID
    case providerId
    case modelID
    case modelId
  }

  init(providerID: String, modelID: String, modelsByProvider: [String: String]? = nil) {
    self.providerID = providerID
    self.modelID = modelID
    self.modelsByProvider = modelsByProvider ?? [providerID: modelID]
  }

  init(from decoder: Decoder) throws {
    let single = try decoder.singleValueContainer()
    if let dict = try? single.decode([String: String].self) {
      modelsByProvider = dict
      if let first = dict.min(by: { $0.key < $1.key }) {
        providerID = first.key
        modelID = first.value
      } else {
        providerID = ""
        modelID = ""
      }
      return
    }

    let c = try decoder.container(keyedBy: CodingKeys.self)
    providerID =
      (try? c.decode(String.self, forKey: .providerID)) ?? (try? c.decode(String.self, forKey: .providerId)) ?? ""
    modelID = (try? c.decode(String.self, forKey: .modelID)) ?? (try? c.decode(String.self, forKey: .modelId)) ?? ""
    modelsByProvider = providerID.isEmpty || modelID.isEmpty ? [:] : [providerID: modelID]
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(providerID, forKey: .providerID)
    try c.encode(modelID, forKey: .modelID)
  }
}

nonisolated struct HealthResponse: Codable {
  let healthy: Bool
  let version: String?
}

nonisolated struct ServerPathInfo: Codable, Sendable {
  let home: String
  let directory: String
  let worktree: String
}

nonisolated enum APIError: Error, Sendable {
  case invalidURL
  case httpError(statusCode: Int, data: Data)
}

protocol APIClientProtocol: Actor {
  func configure(baseURL: String, username: String?, password: String?)
  func health() async throws -> HealthResponse
  func projects(scope: OpenCodeScope?) async throws -> [Project]
  func projectCurrent(scope: OpenCodeScope?) async throws -> Project?
  func serverPaths() async throws -> ServerPathInfo
  func sessions(scope: OpenCodeScope?, limit: Int) async throws -> [Session]
  func session(sessionID: String, scope: OpenCodeScope?) async throws -> Session
  func createSession(title: String?, scope: OpenCodeScope?) async throws -> Session
  func updateSession(sessionID: String, title: String, scope: OpenCodeScope?) async throws -> Session
  func updateSessionArchived(sessionID: String, archived: Int, scope: OpenCodeScope?) async throws -> Session
  func deleteSession(sessionID: String, scope: OpenCodeScope?) async throws
  func messages(sessionID: String, limit: Int?, scope: OpenCodeScope?) async throws -> [MessageWithParts]
  func promptAsync(
    sessionID: String, text: String, attachments: [ComposerImageAttachment], agent: String, model: Message.ModelInfo?,
    scope: OpenCodeScope?) async throws
  func abort(sessionID: String, scope: OpenCodeScope?) async throws
  func sessionStatus(scope: OpenCodeScope?) async throws -> [String: SessionStatus]
  func pendingPermissions(scope: OpenCodeScope?) async throws -> [APIClient.PermissionRequest]
  func respondPermission(
    sessionID: String, permissionID: String, response: APIClient.PermissionResponse, scope: OpenCodeScope?) async throws
  func pendingQuestions(scope: OpenCodeScope?) async throws -> [QuestionRequest]
  func replyQuestion(sessionID: String, requestID: String, answers: [[String]], scope: OpenCodeScope?) async throws
  func rejectQuestion(sessionID: String, requestID: String, scope: OpenCodeScope?) async throws
  func providers(scope: OpenCodeScope?) async throws -> ProvidersResponse
  func providerCatalog(scope: OpenCodeScope?) async throws -> [V2API.Provider]
  func modelCatalog(scope: OpenCodeScope?) async throws -> [V2API.Model]
  func agents(scope: OpenCodeScope?) async throws -> [AgentInfo]
  func commands(scope: OpenCodeScope?) async throws -> [OpenCodeCommand]
  func mcpStatus(scope: OpenCodeScope?) async throws -> [String: MCPStatus]
  func addMCPServer(name: String, config: MCPServerConfig, scope: OpenCodeScope?) async throws -> [String: MCPStatus]
  func toolIDs(scope: OpenCodeScope?) async throws -> [String]
  func tools(providerID: String, modelID: String, scope: OpenCodeScope?) async throws -> [ExperimentalTool]
  func sessionDiff(sessionID: String, scope: OpenCodeScope?) async throws -> [FileDiff]
  func sessionTodos(sessionID: String, scope: OpenCodeScope?) async throws -> [TodoItem]
  func fileList(path: String, scope: OpenCodeScope?) async throws -> [FileNode]
  func fileContent(path: String, scope: OpenCodeScope?) async throws -> FileContent
  func findFile(query: String, limit: Int, scope: OpenCodeScope?) async throws -> [String]
  func fileStatus(scope: OpenCodeScope?) async throws -> [FileStatusEntry]
  func forkSession(sessionID: String, messageID: String?, scope: OpenCodeScope?) async throws -> Session
  func revertSession(
    sessionID: String, messageID: String, partID: String?, scope: OpenCodeScope?
  ) async throws -> Session
}

extension APIClient: APIClientProtocol {}
