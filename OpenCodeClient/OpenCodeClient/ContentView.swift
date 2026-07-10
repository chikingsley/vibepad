//
//  ContentView.swift
//  OpenCodeClient
//

import SwiftUI

#if canImport(UIKit)
  import UIKit
#endif

struct ContentView: View {
  @State private var state: AppState
  @Environment(\.horizontalSizeClass) private var sizeClass
  @State private var showSettingsSheet = false
  @State private var showTabletSettings = false
  @State private var selectedTab = 0

  init() {
    _state = State(initialValue: Self.makeInitialState())
  }

  private static var hasUITestSessionTreeFixture: Bool {
    ProcessInfo.processInfo.arguments.contains("UITEST_SESSION_TREE_FIXTURE")
  }

  private static var hasUITestToolCardsFixture: Bool {
    ProcessInfo.processInfo.arguments.contains("UITEST_TOOL_CARDS_FIXTURE")
  }

  private static var hasUITestF3ComposerFixture: Bool {
    ProcessInfo.processInfo.arguments.contains("UITEST_F3_TRANSCRIBING_FIXTURE")
      || ProcessInfo.processInfo.arguments.contains("UITEST_F3_RETRY_FIXTURE")
  }

  private static var hasUITestWebPreviewFixture: Bool {
    ProcessInfo.processInfo.arguments.contains("UITEST_WEB_PREVIEW_FIXTURE")
  }

  private static var hasUITestHostProfilesFixture: Bool {
    ProcessInfo.processInfo.arguments.contains("UITEST_HOST_PROFILES_FIXTURE")
  }

  /// Which bundled fixture markdown to render in the web preview. Defaults to
  /// the HTML-cards fixture; override via WEB_PREVIEW_FIXTURE_NAME env var.
  private static var webPreviewFixtureName: String {
    let env = ProcessInfo.processInfo.environment["WEB_PREVIEW_FIXTURE_NAME"]
    return env.flatMap { $0.isEmpty ? nil : $0 } ?? "html_cards"
  }

  private static func loadFixtureMarkdown(_ name: String) -> String {
    guard
      let url = Bundle.main.url(forResource: name, withExtension: "md", subdirectory: "WebPreviewFixtures")
        ?? Bundle.main.url(forResource: name, withExtension: "md"),
      let text = try? String(contentsOf: url, encoding: .utf8)
    else {
      return "# Fixture not found: \(name)"
    }
    return text
  }

  private static func makeInitialState() -> AppState {
    let state = AppState()

    if hasUITestHostProfilesFixture {
      applyHostProfilesFixture(to: state)
      return state
    }

    if hasUITestF3ComposerFixture {
      applyF3ComposerFixture(to: state)
      return state
    }

    if hasUITestToolCardsFixture {
      applyToolCardsFixture(to: state)
      return state
    }

    guard hasUITestSessionTreeFixture else { return state }

    state.isConnected = true
    state.sessions = [
      Session(
        id: "root-session",
        slug: "root-session",
        projectID: "p1",
        directory: "/tmp",
        parentID: nil,
        title: "Root Session",
        version: "1",
        time: .init(created: 0, updated: 2_000, archived: nil),
        share: nil,
        summary: nil
      ),
      Session(
        id: "child-session",
        slug: "child-session",
        projectID: "p1",
        directory: "/tmp",
        parentID: "root-session",
        title: "Child Session",
        version: "1",
        time: .init(created: 0, updated: 1_500, archived: nil),
        share: nil,
        summary: nil
      ),
      Session(
        id: "archived-session",
        slug: "archived-session",
        projectID: "p1",
        directory: "/tmp",
        parentID: nil,
        title: "Archived Session",
        version: "1",
        time: .init(created: 0, updated: 1_200, archived: 3_000),
        share: nil,
        summary: nil
      ),
      Session(
        id: "archived-child-session",
        slug: "archived-child-session",
        projectID: "p1",
        directory: "/tmp",
        parentID: "archived-session",
        title: "Archived Child",
        version: "1",
        time: .init(created: 0, updated: 1_100, archived: 3_000),
        share: nil,
        summary: nil
      ),
    ]
    state.currentSessionID = "root-session"
    state.expandedSessionIDs = ["root-session", "archived-session"]
    return state
  }

  private static func applyHostProfilesFixture(to state: AppState) {
    let local = HostProfile(
      name: "Local OpenCode",
      transport: .direct,
      serverURL: "127.0.0.1:4096",
      basicAuth: nil,
      ssh: nil,
      lastUsedAt: Date(timeIntervalSince1970: 1_000)
    )
    let ssh = HostProfile(
      name: "SSH Lab",
      transport: .sshTunnel,
      serverURL: APIClient.defaultServer,
      basicAuth: nil,
      ssh: SSHTunnelConfig(
        isEnabled: true, host: "gateway.example.invalid", port: 8006, username: "opencode", remotePort: 19001),
      lastUsedAt: Date(timeIntervalSince1970: 2_000)
    )
    state.hostProfiles = [local, ssh]
    state.currentHostProfileID = local.id
    state.applyCurrentHostProfileToRuntime(persistLegacy: false)
    state.selectedTab = 2
  }

  /// iPad: left/right split columns, no tab bar
  private var useSplitLayout: Bool { sizeClass == .regular }

  private var themeColorScheme: ColorScheme? {
    switch state.themePreference {
    case "light": return .light
    case "dark": return .dark
    default: return nil
    }
  }

  private var filePreviewSheetItem: Binding<FilePathWrapper?> {
    Binding(
      get: {
        // Use the sheet preview only in compact layout; regular iPad previews inline in the middle column.
        guard !useSplitLayout else { return nil }
        return state.fileToOpenInFilesTab.map { FilePathWrapper(path: $0) }
      },
      set: { newValue, _ in
        Task { @MainActor in
          await Task.yield()
          state.fileToOpenInFilesTab = newValue?.path
          if newValue == nil, !useSplitLayout {
            selectedTab = 0
            state.selectedTab = 0
          }
        }
      }
    )
  }

  @ViewBuilder
  private var rootLayout: some View {
    if useSplitLayout {
      splitLayout
    } else {
      tabLayout
    }
  }

  private struct FileToolFixture {
    let id: String
    let tool: String
    let path: String
  }

  private struct CommandToolFixture {
    let id: String
    let tool: String
    let command: String
    let output: String
  }

  private static func makeFileToolFixtureParts(sessionID: String, messageID: String) -> [Part] {
    let fixtures = [
      FileToolFixture(id: "ap-read", tool: "read_file", path: "src/api/client.ts"),
      FileToolFixture(id: "ap-edit", tool: "edit_file", path: "src/api/types.ts"),
      FileToolFixture(id: "ap-write", tool: "write_file", path: "README.md"),
    ]
    return fixtures.map { fixture in
      decodePart([
        "id": fixture.id,
        "messageID": messageID,
        "sessionID": sessionID,
        "type": "tool",
        "tool": fixture.tool,
        "callID": "call-\(fixture.id)",
        "metadata": ["path": fixture.path],
        "state": [
          "status": "completed",
          "input": ["path": fixture.path],
          "output": "ok",
        ],
      ])
    }
  }

  private static func makeCommandToolFixtureParts(sessionID: String, messageID: String) -> [Part] {
    let fixtures = [
      CommandToolFixture(id: "ap-bash", tool: "bash", command: "npm test", output: "All tests passed"),
      CommandToolFixture(id: "ap-grep", tool: "grep", command: "TODO", output: "3 matches"),
      CommandToolFixture(
        id: "ap-list",
        tool: "list",
        command: "src/api",
        output: "client.ts\ntypes.ts\nindex.ts"
      ),
    ]
    return fixtures.map { fixture in
      decodePart([
        "id": fixture.id,
        "messageID": messageID,
        "sessionID": sessionID,
        "type": "tool",
        "tool": fixture.tool,
        "callID": "call-\(fixture.id)",
        "state": [
          "status": "completed",
          "title": fixture.command,
          "input": ["command": fixture.command],
          "output": fixture.output,
        ],
      ])
    }
  }

  private static func makeAssistantToolCardParts(sessionID: String, messageID: String) -> [Part] {
    var parts = [
      decodePart([
        "id": "ap-text",
        "messageID": messageID,
        "sessionID": sessionID,
        "type": "text",
        "text": "Here are the changes I made.",
      ])
    ]
    parts.append(contentsOf: makeFileToolFixtureParts(sessionID: sessionID, messageID: messageID))
    parts.append(
      decodePart([
        "id": "ap-patch",
        "messageID": messageID,
        "sessionID": sessionID,
        "type": "patch",
        "files": [
          ["path": "src/api/index.ts", "additions": 12, "deletions": 3, "status": "modified"]
        ],
      ]))
    parts.append(contentsOf: makeCommandToolFixtureParts(sessionID: sessionID, messageID: messageID))
    return parts
  }

  /// Injects a deterministic assistant turn so the UI test renders the new tool
  /// cards (file-op grid + merged "N tool calls" row) without a live server.
  /// Only active under the UITEST_TOOL_CARDS_FIXTURE launch argument.
  private static func applyToolCardsFixture(to state: AppState) {
    let sessionID = "toolcards-session"
    let userMessageID = "u-toolcards"
    let assistantMessageID = "a-toolcards"

    state.isConnected = true
    state.sessions = [
      Session(
        id: sessionID,
        slug: sessionID,
        projectID: "p1",
        directory: "/tmp",
        parentID: nil,
        title: "Tool Cards Session",
        version: "1",
        time: .init(created: 0, updated: 2_000, archived: nil),
        share: nil,
        summary: nil
      )
    ]
    state.currentSessionID = sessionID
    state.expandedSessionIDs = [sessionID]

    // User message: a single text part.
    let userInfo = Message(
      id: userMessageID,
      sessionID: sessionID,
      role: "user",
      parentID: nil,
      providerID: nil,
      modelID: nil,
      model: nil,
      error: nil,
      time: .init(created: 1_000, completed: 1_000),
      finish: nil,
      tokens: nil,
      cost: nil
    )
    let userTextPart = decodePart([
      "id": "up-text",
      "messageID": userMessageID,
      "sessionID": sessionID,
      "type": "text",
      "text": "Refactor the API client and run the tests.",
    ])

    // Assistant message: resolvedModel via top-level providerID/modelID so the
    // small "providerID/modelID" footer shows.
    let assistantInfo = Message(
      id: assistantMessageID,
      sessionID: sessionID,
      role: "assistant",
      parentID: userMessageID,
      providerID: "openai",
      modelID: "gpt-5.5",
      model: nil,
      error: nil,
      time: .init(created: 1_100, completed: 1_200),
      finish: "stop",
      tokens: nil,
      cost: nil
    )

    let assistantParts = makeAssistantToolCardParts(sessionID: sessionID, messageID: assistantMessageID)

    state.messages = [
      MessageWithParts(info: userInfo, parts: [userTextPart]),
      MessageWithParts(info: assistantInfo, parts: assistantParts),
    ]
  }

  /// Injects a deterministic busy session for F3 composer screenshots.
  /// The voice-side states are controlled by ChatTabView launch arguments.
  private static func applyF3ComposerFixture(to state: AppState) {
    let sessionID = "f3-composer-session"
    state.isConnected = true
    state.sessions = [
      Session(
        id: sessionID,
        slug: sessionID,
        projectID: "p1",
        directory: "/tmp/opencode-ios-f3-fixture",
        parentID: nil,
        title: "F3 Voice Steer",
        version: "1",
        time: .init(created: 1_000, updated: 2_000, archived: nil),
        share: nil,
        summary: nil
      )
    ]
    state.currentSessionID = sessionID
    state.sessionStatuses[sessionID] = SessionStatus(
      type: "busy", attempt: nil, message: "Running implementation", next: nil)
  }

  /// Decode a Part from a JSON-object dictionary, mirroring how the server feeds
  /// parts through Codable (so metadata/state/path classification flows identically).
  private static func decodePart(_ obj: [String: Any]) -> Part {
    guard
      let data = try? JSONSerialization.data(withJSONObject: obj),
      let part = try? JSONDecoder().decode(Part.self, from: data)
    else {
      preconditionFailure("Invalid deterministic tool-card fixture")
    }
    return part
  }

  private func restoreConnectionFlow() async {
    if Self.hasUITestSessionTreeFixture || Self.hasUITestToolCardsFixture || Self.hasUITestF3ComposerFixture
      || Self.hasUITestWebPreviewFixture || Self.hasUITestWebPreviewModeFixture
    {
      return
    }

    if state.sshTunnelManager.config.isEnabled,
      state.sshTunnelManager.status != .connected
    {
      await state.sshTunnelManager.connect()
    }

    await state.refresh()

    // iOS suspend/restore can leave SSH state stale (status still connected but
    // actual tunnel already dropped). If refresh still cannot reach server through
    // localhost after an enabled SSH config, force a tunnel re-establish once.
    if state.sshTunnelManager.config.isEnabled, !state.isConnected {
      state.sshTunnelManager.disconnect()
      await state.sshTunnelManager.connect()
      await state.refresh()
    }

    if state.isConnected {
      state.connectSSE()
    } else {
      state.disconnectSSE()
    }
  }

  private static var webPreviewFixtureColorScheme: ColorScheme {
    ProcessInfo.processInfo.environment["UITEST_FORCE_THEME"] == "dark" ? .dark : .light
  }

  @ViewBuilder
  private var webPreviewFixtureView: some View {
    MarkdownWebPreviewView(
      input: MarkdownWebPreviewInput(
        markdown: Self.loadFixtureMarkdown(Self.webPreviewFixtureName),
        colorScheme: Self.webPreviewFixtureColorScheme
      )
    )
    .accessibilityIdentifier("web-preview-fixture-root")
    .ignoresSafeArea()
  }

  private static var hasUITestWebPreviewModeFixture: Bool {
    ProcessInfo.processInfo.arguments.contains("UITEST_WEB_PREVIEW_MODE_FIXTURE")
  }

  var body: some View {
    #if DEBUG
      if Self.hasUITestWebPreviewModeFixture {
        NavigationStack {
          WebPreviewModeFixtureHost(
            markdown: Self.loadFixtureMarkdown(Self.webPreviewFixtureName)
          )
        }
        .preferredColorScheme(Self.webPreviewFixtureColorScheme)
      } else if Self.hasUITestWebPreviewFixture {
        webPreviewFixtureView
          .preferredColorScheme(Self.webPreviewFixtureColorScheme)
      } else {
        mainBody
      }
    #else
      if Self.hasUITestWebPreviewFixture {
        webPreviewFixtureView
          .preferredColorScheme(Self.webPreviewFixtureColorScheme)
      } else {
        mainBody
      }
    #endif
  }

  private var mainBody: some View {
    rootLayout
      .task {
        await restoreConnectionFlow()
      }
      .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
        Task {
          await restoreConnectionFlow()
        }
      }
      .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
        state.disconnectSSE()
        if state.sshTunnelManager.config.isEnabled {
          state.sshTunnelManager.disconnect()
        }
      }
      .preferredColorScheme(themeColorScheme)
      .environment(\.locale, L10n.currentLocale)
      .onAppear {
        selectedTab = state.selectedTab
      }
      .onChange(of: sizeClass) { _, newValue in
        // When switching from compact to split layout, migrate the sheet preview into the middle-column preview.
        if newValue == .regular, let p = state.fileToOpenInFilesTab {
          Task { @MainActor in
            await Task.yield()
            state.previewFilePath = p
            state.fileToOpenInFilesTab = nil
          }
        }
      }
      .onChange(of: selectedTab) { oldTab, newTab in
        Task { @MainActor in
          await Task.yield()
          state.selectedTab = newTab
        }
        if oldTab == 2 && newTab != 2 {
          Task { await state.refresh() }
        }
      }
      .onChange(of: state.selectedTab) { _, newTab in
        guard selectedTab != newTab else { return }
        Task { @MainActor in
          await Task.yield()
          selectedTab = newTab
        }
      }
      .sheet(item: filePreviewSheetItem) { wrapper in
        NavigationStack {
          FileContentView(state: state, filePath: wrapper.path)
            .toolbar {
              ToolbarItem(placement: .cancellationAction) {
                Button {
                  Task { @MainActor in
                    state.fileToOpenInFilesTab = nil
                    if !useSplitLayout {
                      selectedTab = 0
                      state.selectedTab = 0
                    }
                  }
                } label: {
                  Image(systemName: "xmark")
                }
                .accessibilityLabel(L10n.t(.appClose))
              }
            }
        }
      }
      .sheet(
        isPresented: $showSettingsSheet,
        onDismiss: {
          Task { await state.refresh() }
        },
        content: {
          NavigationStack {
            SettingsTabView(state: state)
              .toolbar {
                ToolbarItem(placement: .primaryAction) {
                  Button(L10n.t(.appClose)) { showSettingsSheet = false }
                }
              }
          }
        }
      )
  }

  /// Compact: three-tab tab bar
  private var tabLayout: some View {
    TabView(selection: $selectedTab) {
      ChatTabView(state: state)
        .tabItem { Label(L10n.t(.appChat), systemImage: "bubble.left.and.text.bubble.right") }
        .tag(0)

      FilesTabView(state: state)
        .tabItem { Label(L10n.t(.navFiles), systemImage: "folder") }
        .tag(1)

      SettingsTabView(state: state)
        .tabItem { Label(L10n.t(.navSettings), systemImage: "gear") }
        .tag(2)
    }
  }

  /// iPad: Android-aligned three-pane layout.
  @State private var sessionsCollapsed: Bool = false

  private var splitLayout: some View {
    GeometryReader { geo in
      let total = geo.size.width
      // When collapsed, Sessions width shrinks to 0 and Files / Chat split the total width evenly.
      let sessionsWidth: CGFloat = sessionsCollapsed ? 0 : total * 0.25
      let remaining = total - sessionsWidth
      let paneWidth = sessionsCollapsed ? remaining / 2 : total * 0.375

      HStack(spacing: 0) {
        if !sessionsCollapsed {
          TabletSessionsColumn(
            state: state,
            showSettings: $showTabletSettings,
            onCollapse: { withAnimation(DesignAnimation.spring) { sessionsCollapsed = true } }
          )
          .frame(width: sessionsWidth)
          .transition(.move(edge: .leading))

          Divider()
        }

        TabletFilesColumn(
          state: state,
          sessionsCollapsed: sessionsCollapsed,
          onExpandSessions: { withAnimation(DesignAnimation.spring) { sessionsCollapsed = false } }
        )
        .frame(width: paneWidth)

        Divider()

        ChatTabView(
          state: state,
          showSettingsInToolbar: false,
          showSessionListInToolbar: false,
          showCreateSessionInToolbar: false
        )
        .frame(width: paneWidth)
      }
      // When collapsed, allow a right-swipe from the left screen edge to expand Sessions
      .overlay(alignment: .leading) {
        if sessionsCollapsed {
          Color.clear
            .frame(width: 16)
            .contentShape(Rectangle())
            .gesture(
              DragGesture(minimumDistance: 20)
                .onEnded { value in
                  if value.translation.width > 40 && abs(value.translation.height) < 80 {
                    withAnimation(DesignAnimation.spring) {
                      sessionsCollapsed = false
                    }
                  }
                }
            )
        }
      }
    }
  }
}

private struct FilePathWrapper: Identifiable {
  let path: String
  var id: String { path }
}

private struct TabletFilesColumn: View {
  @Bindable var state: AppState
  var sessionsCollapsed: Bool = false
  var onExpandSessions: (() -> Void)?

  var body: some View {
    NavigationStack {
      Group {
        if let path = state.previewFilePath, !path.isEmpty {
          FileContentView(state: state, filePath: path)
        } else {
          FileTreeView(state: state, forceSplitPreview: true)
            .searchable(text: $state.fileSearchQuery, prompt: L10n.t(.appSearchFiles))
            .onSubmit(of: .search) {
              Task { await state.searchFiles(query: state.fileSearchQuery) }
            }
            .onChange(of: state.fileSearchQuery) { _, newValue in
              if newValue.isEmpty {
                state.fileSearchResults = []
              } else {
                Task {
                  try? await Task.sleep(for: .milliseconds(300))
                  guard !Task.isCancelled else { return }
                  await state.searchFiles(query: newValue)
                }
              }
            }
            .navigationTitle(L10n.t(.navFiles))
            .navigationBarTitleDisplayMode(.inline)
        }
      }
      .toolbar {
        // When Sessions is collapsed, show an "Expand Sessions" button at the top-left of the Files toolbar
        if sessionsCollapsed, let onExpandSessions {
          ToolbarItem(placement: .topBarLeading) {
            Button(action: onExpandSessions) {
              Image(systemName: "sidebar.left")
            }
            .help(L10n.t(.sidebarShowSessions))
            .accessibilityIdentifier("ipad-show-sessions-button")
          }
        }
        ToolbarItem(placement: .primaryAction) {
          if let path = state.previewFilePath, !path.isEmpty {
            Button {
              state.previewFilePath = nil
              state.fileToOpenInFilesTab = nil
            } label: {
              Image(systemName: "xmark")
            }
            .help(L10n.t(.appClose))
          }
        }
      }
    }
  }
}

private struct TabletSessionsColumn: View {
  @Bindable var state: AppState
  @Binding var showSettings: Bool
  var onCollapse: (() -> Void)?
  @State private var activeExpanded = true
  @State private var archivedExpanded = false
  @State private var mutatingSessionID: String?
  @State private var actionError: String?
  @State private var showCreateDisabledAlert = false

  private var activeNodes: [SessionNode] {
    state.sessionTree(archived: false)
  }

  private var archivedNodes: [SessionNode] {
    state.sessionTree(archived: true)
  }

  var body: some View {
    NavigationStack {
      Group {
        if showSettings {
          SettingsTabView(state: state)
        } else if activeNodes.isEmpty && archivedNodes.isEmpty {
          ContentUnavailableView(
            L10n.t(.sessionsEmptyTitle),
            systemImage: "bubble.left.and.text.bubble.right",
            description: Text(L10n.t(.sessionsEmptyDescription))
          )
        } else {
          List {
            SessionSectionHeader(title: L10n.t(.sessionsActive), isExpanded: activeExpanded) {
              activeExpanded.toggle()
            }

            if activeExpanded {
              sessionNodes(activeNodes, archived: false)
            }

            SessionSectionHeader(title: L10n.t(.sessionsArchived), isExpanded: archivedExpanded) {
              archivedExpanded.toggle()
            }

            if archivedExpanded {
              sessionNodes(archivedNodes, archived: true)
            }

            if state.isLoadingMoreSessions {
              LoadMoreSessionsRow(isLoading: true) {}
            } else if state.canLoadMoreSessions {
              LoadMoreSessionsRow(isLoading: false) {
                Task { await state.loadMoreSessions() }
              }
            }
          }
          .listStyle(.plain)
          .contentMargins(.top, 0, for: .scrollContent)
          .refreshable {
            await state.refreshSessions()
          }
        }
      }
      .navigationTitle(showSettings ? L10n.t(.navSettings) : L10n.t(.sessionsTitle))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        // "Collapse" button at the top-left of the Sessions column (shown everywhere except the settings sheet)
        if !showSettings, let onCollapse {
          ToolbarItem(placement: .topBarLeading) {
            Button(action: onCollapse) {
              Image(systemName: "sidebar.left")
            }
            .help(L10n.t(.sidebarHideSessions))
            .accessibilityIdentifier("ipad-hide-sessions-button")
          }
        }
        ToolbarItem(placement: .primaryAction) {
          if showSettings {
            Button(L10n.t(.appDone)) {
              showSettings = false
              Task { await state.refresh() }
            }
          } else {
            HStack(spacing: 8) {
              // Use a plus icon instead of the "New" text to leave room for the Sessions title on iPad
              // (Sessions is also a narrow column; a text button would squeeze the title into an ellipsis)
              Button {
                Task { await state.createSession() }
              } label: {
                Image(systemName: "plus")
              }
              .disabled(!state.canCreateSession)
              .foregroundColor(state.canCreateSession ? DesignColors.Brand.primary : DesignColors.Neutral.textTertiary)
              .help(L10n.t(.sessionsNew))
              .accessibilityLabel(L10n.t(.sessionsNew))

              if !state.canCreateSession {
                Button {
                  showCreateDisabledAlert = true
                } label: {
                  Image(systemName: "info.circle")
                }
                .foregroundColor(.secondary)
              }

              Button {
                showSettings = true
              } label: {
                Image(systemName: "gear")
              }
            }
          }
        }
      }
    }
    .alert(
      L10n.t(.sessionsActionFailedTitle),
      isPresented: Binding(
        get: { actionError != nil },
        set: { if !$0 { actionError = nil } }
      )
    ) {
      Button(L10n.t(.commonOk)) {
        actionError = nil
      }
    } message: {
      if let actionError {
        Text(actionError)
      }
    }
    .alert(state.createSessionDisabledHint, isPresented: $showCreateDisabledAlert) {
      Button(L10n.t(.commonOk)) {}
    }
  }

  private func sessionNodes(_ nodes: [SessionNode], archived: Bool, depth: Int = 0) -> AnyView {
    AnyView(
      ForEach(nodes) { node in
        let session = node.session
        let status = state.sessionStatuses[session.id]

        SessionRowView(
          session: session,
          status: status,
          isSelected: state.currentSessionID == session.id,
          isMutating: mutatingSessionID == session.id,
          isArchived: archived,
          depth: depth,
          hasChildren: !node.children.isEmpty,
          isCollapsed: !state.expandedSessionIDs.contains(session.id),
          onSelect: { state.selectSession(session) },
          onToggleCollapse: { state.toggleSessionExpanded(session.id) }
        )
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
          Button {
            mutateSession(session) {
              if archived {
                try await state.restoreSession(sessionID: session.id)
              } else {
                try await state.archiveSession(sessionID: session.id)
              }
            }
          } label: {
            Label(
              archived ? L10n.t(.sessionsRestore) : L10n.t(.sessionsArchive),
              systemImage: archived ? "arrow.uturn.backward" : "archivebox")
          }
          .tint(DesignColors.Brand.primary.opacity(0.7))
          .disabled(mutatingSessionID != nil)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
          Button {
            mutateSession(session) {
              try await state.deleteSession(sessionID: session.id)
            }
          } label: {
            Label(L10n.t(.sessionsDelete), systemImage: "trash")
          }
          .tint(.red)
          .disabled(mutatingSessionID != nil)
        }

        if state.expandedSessionIDs.contains(session.id) {
          sessionNodes(node.children, archived: archived, depth: depth + 1)
        }
      }
    )
  }

  private func mutateSession(_ session: Session, action: @escaping () async throws -> Void) {
    guard mutatingSessionID == nil else { return }
    mutatingSessionID = session.id
    Task {
      do {
        try await action()
      } catch {
        actionError = error.localizedDescription
      }
      mutatingSessionID = nil
    }
  }
}

#Preview {
  ContentView()
}
