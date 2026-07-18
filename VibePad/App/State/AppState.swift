//
//  AppState.swift
//  VibePad
//

import Foundation
import Observation
import os

nonisolated struct SessionNode: Identifiable, Sendable {
  let session: Session
  let children: [SessionNode]
  var id: String { session.id }
}

@Observable
@MainActor
final class AppState {
  static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "VibePad",
    category: "AppState"
  )

  struct ServerURLInfo {
    let raw: String
    let normalized: String?
    let scheme: String?
    let host: String?
    let isLocal: Bool
    /// Tailscale MagicDNS (*.ts.net) — ATS exception, HTTP allowed.
    let isTailscale: Bool
    let isAllowed: Bool
    let warning: String?
  }

  /// Ensures server URL has http:// or https:// prefix. Returns normalized string if missing scheme, nil otherwise.
  /// Call after correctMalformedServerURL. Ensures the stored/displayed value is explicit and avoids URL parsing quirks.
  nonisolated static func ensureServerURLHasScheme(_ raw: String) -> String? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    guard !trimmed.hasPrefix("http://"), !trimmed.hasPrefix("https://") else { return nil }
    return "http://\(trimmed)"
  }

  /// Fixes malformed "host://host:port" (e.g. from iOS .textContentType(.URL) autocorrect or paste).
  /// Returns corrected string if malformed, nil otherwise.
  nonisolated static func correctMalformedServerURL(_ raw: String) -> String? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let idx = trimmed.range(of: "://") else { return nil }
    let beforeScheme = String(trimmed[..<idx.lowerBound])
    let afterScheme = String(trimmed[idx.upperBound...])
    guard afterScheme.hasPrefix(beforeScheme), beforeScheme != "http", beforeScheme != "https" else { return nil }
    return beforeScheme + afterScheme.dropFirst(beforeScheme.count)
  }

  /// LAN allows HTTP; WAN requires HTTPS.
  nonisolated static func serverURLInfo(_ raw: String) -> ServerURLInfo {
    var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if let corrected = Self.correctMalformedServerURL(trimmed) {
      trimmed = corrected
    }
    guard !trimmed.isEmpty else {
      return .init(
        raw: raw, normalized: nil, scheme: nil, host: nil, isLocal: true, isTailscale: false, isAllowed: false,
        warning: L10n.t(.errorServerAddressEmpty))
    }

    func parseHost(_ s: String) -> String? {
      if let u = URL(string: s), let h = u.host { return h }
      if let u = URL(string: "http://\(s)"), let h = u.host { return h }
      return nil
    }

    func isPrivateIPv4(_ host: String) -> Bool {
      let parts = host.split(separator: ".")
      guard parts.count == 4,
        let a = Int(parts[0]), let b = Int(parts[1])
      else { return false }
      if a == 10 || a == 127 { return true }
      if a == 192 && b == 168 { return true }
      if a == 172 && (16...31).contains(b) { return true }
      if a == 169 && b == 254 { return true }
      if host == "0.0.0.0" { return true }
      return false
    }

    let hasScheme = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
    let host = parseHost(trimmed)
    let isLocal: Bool = {
      guard let host else { return true }
      if host == "localhost" { return true }
      if host.hasSuffix(".local") { return true }
      if isPrivateIPv4(host) { return true }
      return false
    }()

    let scheme: String = {
      if let u = URL(string: trimmed), let s = u.scheme { return s }
      return isLocal ? "http" : "https"
    }()

    let isTailscale = host?.hasSuffix(".ts.net") ?? false
    if scheme == "http", !isLocal, !isTailscale {
      return .init(
        raw: raw,
        normalized: hasScheme ? trimmed : nil,
        scheme: "http",
        host: host,
        isLocal: false,
        isTailscale: false,
        isAllowed: false,
        warning: L10n.t(.errorWanRequiresHttps)
      )
    }

    let normalized = hasScheme ? trimmed : "\(scheme)://\(trimmed)"
    let parsed = URL(string: normalized)
    return .init(
      raw: raw,
      normalized: normalized,
      scheme: parsed?.scheme,
      host: parsed?.host,
      isLocal: isLocal,
      isTailscale: isTailscale,
      isAllowed: parsed != nil,
      warning: parsed == nil
        ? L10n.t(.errorInvalidBaseURL) : (scheme == "http" && !isTailscale ? L10n.t(.errorUsingLanHttp) : nil)
    )
  }
  var _serverURL: String = APIClient.defaultServer
  var serverURL: String {
    get { _serverURL }
    set {
      _serverURL = newValue
      defaults.set(newValue, forKey: Self.serverURLKey)
    }
  }

  var _username: String = ""
  var username: String {
    get { _username }
    set {
      _username = newValue
      defaults.set(newValue, forKey: Self.usernameKey)
    }
  }

  var _password: String = ""
  var password: String {
    get { _password }
    set {
      _password = newValue
      hostProfileRepository.savePassword(newValue, id: Self.passwordKeychainKey)
    }
  }

  static let serverURLKey = "serverURL"
  static let usernameKey = "username"
  static let passwordKeychainKey = "password"
  static let draftInputsBySessionKey = "draftInputsBySession"
  static let selectedModelBySessionKey = "selectedModelBySession"
  static let selectedProjectWorktreeKey = "selectedProjectWorktree"
  static let customProjectPathKey = "customProjectPath"
  static let themePreferenceKey = "themePreference"
  static let hostProfilesKey = "hostProfiles.v1"
  static let currentHostProfileIDKey = "currentHostProfileID.v1"
  static let onboardingCompletedKey = "onboarding.completed.v1"
  static let languagePreferenceKey = L10n.languagePreferenceUserDefaultsKey

  init(
    apiClient: APIClientProtocol = APIClient(),
    sseClient: SSEClientProtocol = SSEClient(),
    sshTunnelManager: SSHTunnelManager? = nil,
    hostProfileRepository: HostProfileRepository = HostProfileRepository(),
    defaults: UserDefaults = .standard
  ) {
    self.apiClient = apiClient
    self.sseClient = sseClient
    self.hostProfileRepository = hostProfileRepository
    self.defaults = defaults
    self.sshTunnelManager = sshTunnelManager ?? SSHTunnelManager()
    if defaults.object(forKey: Self.onboardingCompletedKey) != nil {
      _hasCompletedOnboarding = defaults.bool(forKey: Self.onboardingCompletedKey)
    } else {
      // Existing installs already have real host profiles. Fresh installs do not;
      // persist `false` before the legacy loader creates its placeholder profile.
      _hasCompletedOnboarding = !(hostProfileRepository.loadProfiles()?.isEmpty ?? true)
      defaults.set(_hasCompletedOnboarding, forKey: Self.onboardingCompletedKey)
    }
    if let storedServer = defaults.string(forKey: Self.serverURLKey) {
      if storedServer == APIConstants.legacyDefaultServer {
        _serverURL = APIClient.defaultServer
        defaults.set(APIClient.defaultServer, forKey: Self.serverURLKey)
      } else {
        _serverURL = storedServer
      }
    } else {
      _serverURL = APIClient.defaultServer
    }
    _username = defaults.string(forKey: Self.usernameKey) ?? ""
    _password = hostProfileRepository.password(id: Self.passwordKeychainKey) ?? ""
    loadHostProfilesFromStorageOrLegacy()
    applyCurrentHostProfileToRuntime(persistLegacy: false)

    _selectedProjectWorktree = defaults.string(forKey: Self.selectedProjectWorktreeKey)
    _customProjectPath = defaults.string(forKey: Self.customProjectPathKey) ?? ""
    _themePreference = defaults.string(forKey: Self.themePreferenceKey) ?? "dark"
    _languagePreference = L10n.languagePreference

    if let data = defaults.data(forKey: Self.draftInputsBySessionKey),
      let decoded = try? JSONDecoder().decode([String: String].self, from: data)
    {
      draftInputsBySessionID = decoded
    }

    if let data = defaults.data(forKey: Self.selectedModelBySessionKey),
      let decoded = try? JSONDecoder().decode([String: String].self, from: data)
    {
      selectedModelIDBySessionID = decoded
    }
  }

  // Unsent composer drafts per session.
  var draftInputsBySessionID: [String: String] = [:]

  // Selected model (providerID/modelID) per session.
  var selectedModelIDBySessionID: [String: String] = [:]

  var hostProfiles: [HostProfile] = [] {
    didSet { saveHostProfiles() }
  }

  var currentHostProfileID: UUID = UUID() {
    didSet { hostProfileRepository.saveSelectedProfileID(currentHostProfileID) }
  }

  var currentHostProfile: HostProfile? {
    hostProfiles.first { $0.id == currentHostProfileID }
  }

  var _hasCompletedOnboarding = false
  var hasCompletedOnboarding: Bool {
    get { _hasCompletedOnboarding }
    set {
      _hasCompletedOnboarding = newValue
      defaults.set(newValue, forKey: Self.onboardingCompletedKey)
    }
  }

  var isConnected: Bool = false
  var serverVersion: String?
  var connectionError: String?
  var connectionDiagnostic: ConnectionDiagnostic?
  var pendingSSHHostKeyMismatch: SSHHostKeyMismatch?
  var sendError: String?

  // Session activity (rendered in transcript; session-scoped)
  var sessionActivities: [String: SessionActivity] = [:]

  // Track when a session status was last updated via SSE.
  var sessionStatusUpdatedAt: [String: Date] = [:]

  // Debounce session activity text changes (avoid rapid flipping).
  var activityTextLastChangeAt: [String: Date] = [:]
  var activityTextPendingTask: [String: Task<Void, Never>] = [:]

  var currentSessionActivity: SessionActivity? {
    guard let sid = currentSessionID else { return nil }
    return sessionActivities[sid]
  }

  func activityTextForSession(_ sessionID: String) -> String {
    ActivityTracker.bestSessionActivityText(
      sessionID: sessionID,
      currentSessionID: currentSessionID,
      sessionStatuses: sessionStatuses,
      messages: messages,
      streamingReasoningPart: streamingReasoningPart,
      streamingPartTexts: streamingPartTexts
    )
  }

  /// Unified error handling
  var lastAppError: AppError?

  func setError(_ error: Error, type: ErrorType = .connection) {
    let appError = AppError.from(error)
    lastAppError = appError

    switch type {
    case .connection:
      connectionError = appError.localizedDescription
    case .send:
      sendError = appError.localizedDescription
    }
  }

  func clearError() {
    lastAppError = nil
    connectionError = nil
    sendError = nil
  }

  enum ErrorType {
    case connection
    case send
  }

  let sessionStore = SessionStore()
  let messageStore = MessageStore()
  let fileStore = FileStore()
  let todoStore = TodoStore()

  var sessions: [Session] {
    get { sessionStore.sessions }
    set { sessionStore.sessions = newValue }
  }
  var sortedSessions: [Session] {
    sessions
      .sorted { $0.time.updated > $1.time.updated }
  }
  var sidebarSessions: [Session] {
    sessions
      .filter { $0.parentID == nil }
      .sorted { $0.time.updated > $1.time.updated }
  }
  var sessionTree: [SessionNode] {
    Self.buildSessionTree(from: sessions)
  }
  var currentSessionID: String? {
    get { sessionStore.currentSessionID }
    set { sessionStore.currentSessionID = newValue }
  }
  var sessionStatuses: [String: SessionStatus] {
    get { sessionStore.sessionStatuses }
    set { sessionStore.sessionStatuses = newValue }
  }

  var messages: [MessageWithParts] {
    get { messageStore.messages }
    set { messageStore.messages = newValue }
  }
  var partsByMessage: [String: [Part]] {
    get { messageStore.partsByMessage }
    set { messageStore.partsByMessage = newValue }
  }
  var streamingPartTexts: [String: String] {
    get { messageStore.streamingPartTexts }
    set { messageStore.streamingPartTexts = newValue }
  }
  var streamingReasoningPart: Part? {
    get { messageStore.streamingReasoningPart }
    set { messageStore.streamingReasoningPart = newValue }
  }

  var modelPresets: [ModelPreset] = []
  var providerCatalog: [ProviderSummary] = []
  var selectedModelIndex = 0

  var agents: [AgentInfo] = []
  var selectedAgentIndex: Int = 0
  var isLoadingAgents: Bool = false

  var expandedSessionIDs: Set<String> = []

  func filteredSessions(archived: Bool) -> [Session] {
    return
      sessions
      .filter { $0.isArchived == archived }
      .sorted { $0.time.updated > $1.time.updated }
  }

  func sessionTree(archived: Bool) -> [SessionNode] {
    Self.buildSessionTree(from: filteredSessions(archived: archived))
  }

  var projects: [Project] = []
  var isLoadingProjects: Bool = false
  /// Server's current project worktree (from GET /project/current). Kept for display/diagnostics.
  var serverCurrentProjectWorktree: String?

  /// Directory-scoped OpenCode requests make selected projects independent of the server default.
  var projectMismatchWarning: String? {
    nil
  }

  var canCreateSession: Bool {
    isConnected
  }

  var createSessionDisabledHint: String {
    connectionError ?? L10n.t(.hostDiagnosticHintVerifyHostConfig)
  }

  var selectedProjectWorktree: String? {
    get { _selectedProjectWorktree }
    set {
      _selectedProjectWorktree = newValue
      defaults.set(newValue, forKey: Self.selectedProjectWorktreeKey)
    }
  }
  var _selectedProjectWorktree: String?

  var customProjectPath: String {
    get { _customProjectPath }
    set {
      _customProjectPath = newValue
      defaults.set(newValue, forKey: Self.customProjectPathKey)
    }
  }
  var _customProjectPath: String = ""

  /// Effective directory for session fetch: selected project or custom path, nil = server default
  var effectiveProjectDirectory: String? {
    guard let sel = selectedProjectWorktree, !sel.isEmpty else { return nil }
    if sel == Self.customProjectSentinel {
      let path = customProjectPath.trimmingCharacters(in: .whitespacesAndNewlines)
      return path.isEmpty ? nil : path
    }
    return sel
  }

  var effectiveOpenCodeScope: OpenCodeScope {
    OpenCodeScope(directory: effectiveProjectDirectory)
  }

  var currentSessionScope: OpenCodeScope {
    OpenCodeScope(directory: currentSession?.directory ?? effectiveProjectDirectory)
  }

  var activeOpenCodeScope: OpenCodeScope {
    OpenCodeScope(directory: effectiveProjectDirectory ?? currentSession?.directory)
  }

  func scope(forSessionID sessionID: String) -> OpenCodeScope {
    OpenCodeScope(directory: sessions.first(where: { $0.id == sessionID })?.directory ?? effectiveProjectDirectory)
  }

  /// Sentinel value when user selects "Custom path" option
  static let customProjectSentinel = "__custom__"

  var pendingPermissions: [PendingPermission] = []
  var pendingQuestions: [QuestionRequest] = []

  var themePreference: String {
    get { _themePreference }
    set {
      _themePreference = newValue
      defaults.set(newValue, forKey: Self.themePreferenceKey)
    }
  }
  var _themePreference = "dark"  // "auto" | "light" | "dark"
  var _languagePreference: L10n.LanguagePreference = .system
  var languagePreference: L10n.LanguagePreference {
    get { _languagePreference }
    set {
      _languagePreference = newValue
      L10n.languagePreference = newValue
    }
  }

  var sessionDiffs: [FileDiff] {
    get { fileStore.sessionDiffs }
    set { fileStore.sessionDiffs = newValue }
  }
  var selectedDiffFile: String? {
    get { fileStore.selectedDiffFile }
    set { fileStore.selectedDiffFile = newValue }
  }
  // 0=Chat, 1=Files, 2=Settings
  var selectedTab: Int = 0

  // Set when navigating here from a tool tap in Chat; shown in the Files tab or a sheet.
  var fileToOpenInFilesTab: String?

  /// iPad three-column layout: middle-column file preview
  var previewFilePath: String?

  var sessionTodos: [String: [TodoItem]] {
    get { todoStore.sessionTodos }
    set { todoStore.sessionTodos = newValue }
  }

  var fileTreeRoot: [FileNode] {
    get { fileStore.fileTreeRoot }
    set { fileStore.fileTreeRoot = newValue }
  }
  var fileStatusMap: [String: String] {
    get { fileStore.fileStatusMap }
    set { fileStore.fileStatusMap = newValue }
  }
  var expandedPaths: Set<String> {
    get { fileStore.expandedPaths }
    set { fileStore.expandedPaths = newValue }
  }
  var fileChildrenCache: [String: [FileNode]] {
    get { fileStore.fileChildrenCache }
    set { fileStore.fileChildrenCache = newValue }
  }
  var fileSearchQuery: String {
    get { fileStore.fileSearchQuery }
    set { fileStore.fileSearchQuery = newValue }
  }
  var fileSearchResults: [String] {
    get { fileStore.fileSearchResults }
    set { fileStore.fileSearchResults = newValue }
  }

  // Provider config cache (for context usage ring)
  var providersResponse: ProvidersResponse?
  var providerModelsIndex: [String: ProviderModel] = [:]
  var providerConfigError: String?

  let apiClient: APIClientProtocol
  let sseClient: SSEClientProtocol
  let sshTunnelManager: SSHTunnelManager
  let hostProfileRepository: HostProfileRepository
  let defaults: UserDefaults
  var sseTask: Task<Void, Never>?

  /// Guard against race conditions when rapidly switching sessions.
  /// Each selectSession call generates a new ID; async tasks check if they're still current.
  var sessionLoadingID = UUID()
  nonisolated private static let sessionPageSize = 100
  var loadedSessionLimit = sessionPageSize
  var hasMoreSessions = true
  var isLoadingMoreSessions = false

  var canLoadMoreSessions: Bool {
    hasMoreSessions && !isLoadingMoreSessions
  }

  // WAN optimization: page message history in fixed-size message batches.
  nonisolated private static let messagePageSize = 20
  var loadedMessageLimitBySessionID: [String: Int] = [:]
  var hasMoreHistoryBySessionID: [String: Bool] = [:]
  var loadingOlderMessagesSessionIDs: Set<String> = []

  var selectedModel: ModelPreset? {
    guard modelPresets.indices.contains(selectedModelIndex) else { return nil }
    return modelPresets[selectedModelIndex]
  }

  var selectedAgent: AgentInfo? {
    let visibleAgents = agents.filter { $0.isVisible }
    guard visibleAgents.indices.contains(selectedAgentIndex) else { return nil }
    return visibleAgents[selectedAgentIndex]
  }

  var visibleAgents: [AgentInfo] {
    agents.filter { $0.isVisible }
  }

  var isCurrentSessionHistoryTruncated: Bool {
    guard let sessionID = currentSessionID else { return false }
    return hasMoreHistoryBySessionID[sessionID] ?? false
  }

  var isLoadingOlderMessagesInCurrentSession: Bool {
    guard let sessionID = currentSessionID else { return false }
    return loadingOlderMessagesSessionIDs.contains(sessionID)
  }

  nonisolated static func normalizedMessageFetchLimit(
    current: Int?,
    pageSize: Int = 20
  ) -> Int {
    let fallback = max(pageSize, 1)
    guard let current else { return fallback }
    return max(current, fallback)
  }

  nonisolated static func nextMessageFetchLimit(
    current: Int?,
    pageSize: Int = 20
  ) -> Int {
    normalizedMessageFetchLimit(current: current, pageSize: pageSize) + max(pageSize, 1)
  }

  nonisolated static func nextSessionIDAfterDeleting(
    deletedSessionID: String,
    currentSessionID: String?,
    remainingSessions: [Session]
  ) -> String? {
    guard currentSessionID == deletedSessionID else { return currentSessionID }
    return remainingSessions.max { $0.time.updated < $1.time.updated }?.id
  }

  nonisolated static func nextSessionFetchLimit(
    current: Int,
    pageSize: Int = sessionPageSize
  ) -> Int {
    max(current, pageSize) + max(pageSize, 1)
  }

  nonisolated static func buildSessionTree(from sessions: [Session]) -> [SessionNode] {
    let sessionIDs = Set(sessions.map(\.id))
    let childrenMap = Dictionary(grouping: sessions, by: \.parentID)

    func buildNodes(parentID: String?) -> [SessionNode] {
      (childrenMap[parentID] ?? [])
        .sorted { $0.time.updated > $1.time.updated }
        .map { session in
          SessionNode(session: session, children: buildNodes(parentID: session.id))
        }
    }

    var roots = buildNodes(parentID: nil)

    let orphans =
      sessions
      .filter { session in
        guard let pid = session.parentID else { return false }
        return !sessionIDs.contains(pid)
      }
      .sorted { $0.time.updated > $1.time.updated }
      .map { session in
        SessionNode(session: session, children: buildNodes(parentID: session.id))
      }

    roots.append(contentsOf: orphans)
    roots.sort { $0.session.time.updated > $1.session.time.updated }
    return roots
  }

  var currentSession: Session? {
    guard let id = currentSessionID else { return nil }
    return sessions.first { $0.id == id }
  }

  var currentSessionStatus: SessionStatus? {
    guard let id = currentSessionID else { return nil }
    return sessionStatuses[id]
  }

  var isBusy: Bool {
    isBusySession(currentSessionStatus)
  }

  var currentTodos: [TodoItem] {
    guard let id = currentSessionID else { return [] }
    return sessionTodos[id] ?? []
  }

  /// Async request result should only apply when requested session is still current.
  nonisolated static func shouldApplySessionScopedResult(requestedSessionID: String, currentSessionID: String?) -> Bool
  {
    requestedSessionID == currentSessionID
  }

  func refresh() async {
    await testConnection()
    if isConnected {
      async let agentsResult: Void = loadAgents()
      async let providersResult: Void = loadProvidersConfig()
      async let projectsResult: Void = loadProjects()
      await loadSessions()
      _ = await agentsResult
      _ = await providersResult
      _ = await projectsResult
      await loadMessages()
      await refreshPendingPermissions()
      await loadSessionDiff()
      await loadSessionTodos()
      await loadFileTree()
      await loadFileStatus()
      await syncSessionStatusesFromPoll()
    }
  }

  func loadProvidersConfig() async {
    do {
      async let legacy = apiClient.providers(scope: activeOpenCodeScope)
      async let providers = apiClient.providerCatalog(scope: activeOpenCodeScope)
      async let models = apiClient.modelCatalog(scope: activeOpenCodeScope)
      let (resp, catalogProviders, catalogModels) = try await (legacy, providers, models)
      providersResponse = resp
      providerCatalog = catalogProviders.map { ProviderSummary(id: $0.id, name: $0.name) }
      applyModelCatalog(catalogModels, defaults: resp.default)
      providerConfigError = nil
      var idx: [String: ProviderModel] = [:]
      for p in resp.providers {
        for (modelID, m) in p.models {
          let key = "\(p.id)/\(modelID)"
          idx[key] = m
        }
      }
      providerModelsIndex = idx
    } catch {
      providerConfigError = error.localizedDescription
    }
  }

  private func applyModelCatalog(_ models: [V2API.Model], defaults: DefaultProvider?) {
    let previousID = selectedModel?.id
    modelPresets =
      models
      .filter(\.isSelectable)
      .map {
        ModelPreset(
          displayName: $0.name,
          providerID: $0.providerID,
          modelID: $0.id,
          acceptsImages: $0.acceptsImages,
          acceptsPDF: $0.acceptsPDF
        )
      }
      .sorted {
        if $0.providerID != $1.providerID { return $0.providerID < $1.providerID }
        return $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending
      }

    let requestedTestModel = ProcessInfo.processInfo.environment["UITEST_MODEL_ID"]
    let candidates =
      [requestedTestModel, previousID, currentSessionID.flatMap { selectedModelIDBySessionID[$0] }]
      .compactMap { $0 }
      + (defaults?.modelsByProvider.sorted { $0.key < $1.key }.map { "\($0.key)/\($0.value)" } ?? [])
    selectedModelIndex =
      candidates.compactMap { id in
        modelPresets.firstIndex(where: { $0.id == id })
      }.first ?? 0
  }

}

nonisolated struct PendingPermission: Identifiable, Sendable {
  var id: String { "\(sessionID)/\(permissionID)" }
  let sessionID: String
  let permissionID: String
  let permission: String?
  let patterns: [String]
  let allowAlways: Bool
  let tool: String?
  let description: String
}

nonisolated struct SessionActivity: Identifiable, Sendable {
  nonisolated enum State: Equatable, Sendable {
    case running
    case completed
  }

  var id: String { sessionID }
  let sessionID: String
  var state: State
  var text: String
  let startedAt: Date
  var endedAt: Date?
  var anchorMessageID: String?

  func elapsedSeconds(now: Date = Date()) -> Int {
    let end = endedAt ?? now
    return max(0, Int(end.timeIntervalSince(startedAt)))
  }

  func elapsedString(now: Date = Date()) -> String {
    let secs = elapsedSeconds(now: now)
    return String(format: "%d:%02d", secs / 60, secs % 60)
  }
}
