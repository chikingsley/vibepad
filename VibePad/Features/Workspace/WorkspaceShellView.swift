import SwiftUI

struct WorkspaceShellView: View {
  @Bindable var state: AppState
  @Bindable var workspace: WorkspaceStore

  @State private var showsSessions = false
  @State private var showsFiles = false
  @State private var showsSettings = false

  private var serverKey: String { state.serverURL }
  private var projectDirectory: String { state.effectiveProjectDirectory ?? state.currentSession?.directory ?? "" }

  var body: some View {
    HStack(spacing: 0) {
      projectRail
      SCSeparator(.vertical)

      VStack(spacing: 0) {
        workspaceHeader
        SCSeparator()

        SessionTabStrip(
          workspace: workspace,
          onSelect: activate,
          onNewTab: createDraft,
          onRename: rename
        )
        SCSeparator()

        workbench
      }
    }
    .sheet(isPresented: $showsSessions) {
      SessionListView(state: state)
    }
    .sheet(isPresented: $showsFiles) {
      FilesTabView(state: state)
    }
    .sheet(isPresented: $showsSettings) {
      NavigationStack {
        SettingsTabView(state: state)
      }
    }
    .onAppear { bootstrapTabs() }
    .onChange(of: state.currentSessionID) { _, sessionID in
      guard
        let sessionID,
        workspace.selectedTab?.sessionID != sessionID,
        let session = state.sessions.first(where: { $0.id == sessionID })
      else { return }
      workspace.openSession(session, serverKey: serverKey)
    }
    .onChange(of: state.sessions) { _, sessions in
      workspace.reconcileSessions(sessions, serverKey: serverKey)
    }
  }

  private var projectRail: some View {
    VStack(spacing: 8) {
      Image(systemName: "scribble.variable")
        .font(.title2.weight(.semibold))
        .foregroundStyle(DesignColors.Brand.primary)
        .frame(width: 40, height: 40)
        .accessibilityLabel("VibePad")
        .accessibilityIdentifier("workspace-shell")

      Button {
        showsSessions = true
      } label: {
        Image(systemName: "bubble.left.and.bubble.right")
      }
      .buttonStyle(.sc(.secondary, size: .iconSM))
      .accessibilityLabel("Sessions")
      .accessibilityIdentifier("workspace-sessions")

      Button {
        showsFiles = true
      } label: {
        Image(systemName: "folder")
      }
      .buttonStyle(.sc(.ghost, size: .iconSM))
      .accessibilityLabel("Files")
      .accessibilityIdentifier("workspace-files")

      Spacer()

      Button {
        state.themePreference = state.themePreference == "dark" ? "light" : "dark"
      } label: {
        Image(systemName: state.themePreference == "dark" ? "sun.max" : "moon")
      }
      .buttonStyle(.sc(.ghost, size: .iconSM))
      .accessibilityLabel(state.themePreference == "dark" ? "Use light appearance" : "Use dark appearance")
      .accessibilityIdentifier("workspace-theme-toggle")
      .scContextMenu {
        SCContextMenuRadioGroup("Appearance", selection: $state.themePreference) {
          SCContextMenuRadioItem(value: "auto") { Text("System") }
          SCContextMenuRadioItem(value: "light") { Text("Light") }
          SCContextMenuRadioItem(value: "dark") { Text("Dark") }
        }
      }

      Button {
        showsSettings = true
      } label: {
        Image(systemName: "gearshape")
      }
      .buttonStyle(.sc(.ghost, size: .iconSM))
      .accessibilityLabel("Settings")
      .accessibilityIdentifier("workspace-settings")
    }
    .padding(.vertical, 10)
    .frame(width: 58)
    .background(.bar)
  }

  private var workspaceHeader: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 1) {
        Text(projectDirectory.isEmpty ? "OpenCode workspace" : URL(fileURLWithPath: projectDirectory).lastPathComponent)
          .font(.subheadline.weight(.semibold))
          .lineLimit(1)
        Text(projectDirectory.isEmpty ? serverKey : projectDirectory)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.middle)
      }

      Spacer()

      SCPopover {
        SCPopoverTrigger {
          Label(
            state.isConnected ? "Connected" : "Disconnected",
            systemImage: state.isConnected ? "checkmark.circle.fill" : "exclamationmark.circle"
          )
          .foregroundStyle(state.isConnected ? DesignColors.Semantic.success : DesignColors.Semantic.error)
          .accessibilityIdentifier("workspace-connection-status")
        }
      } content: {
        SCPopoverContent {
          VStack(alignment: .leading, spacing: 8) {
            Text(state.currentHostProfile?.name ?? "OpenCode server")
              .font(.headline)
            Text(serverKey)
              .font(.caption.monospaced())
              .foregroundStyle(.secondary)
            Text(state.isConnected ? "OpenCode API is reachable." : "OpenCode API is not reachable.")
              .font(.caption)
          }
          .frame(width: 260, alignment: .leading)
        }
      }
      .buttonStyle(.sc(.ghost, size: .sm))

      Button {
      } label: {
        Label("Preview", systemImage: "play.rectangle")
      }
      .buttonStyle(.sc(.outline, size: .sm))
      .disabled(true)
      .accessibilityHint("Automatic project preview is the next vertical slice")
      .accessibilityIdentifier("workspace-preview")
    }
    .padding(.horizontal, 14)
    .frame(minHeight: 52)
    .background(.bar)
  }

  @ViewBuilder
  private var workbench: some View {
    if let tab = workspace.selectedTab {
      if tab.kind == .draft {
        ChatTabView(
          state: state,
          showSettingsInToolbar: false,
          showSessionListInToolbar: false,
          showCreateSessionInToolbar: false,
          showsHeader: false,
          draftStorageID: draftStorageID(for: tab),
          draftAccessory: AnyView(
            DraftProjectSelector(state: state, workspace: workspace, tab: tab)
          ),
          onSubmitDraft: { text, attachments in
            await submitDraft(tab, text: text, attachments: attachments)
          }
        )
        .id(tab.id)
      } else {
        ChatTabView(
          state: state,
          showSettingsInToolbar: false,
          showSessionListInToolbar: false,
          showCreateSessionInToolbar: false,
          showsHeader: false
        )
        .id(tab.id)
      }
    } else {
      ContentUnavailableView {
        Label("No open session", systemImage: "rectangle.stack.badge.plus")
      } description: {
        Text("Open a session or create a new tab.")
      } actions: {
        Button("New session", action: createDraft)
          .buttonStyle(.sc())
      }
    }
  }

  private func bootstrapTabs() {
    if workspace.tabs.isEmpty {
      if let session = state.currentSession {
        workspace.openSession(session, serverKey: serverKey)
      } else {
        createDraft()
      }
    } else if let selected = workspace.selectedTab {
      activate(selected)
    }
  }

  private func createDraft() {
    let tab = workspace.newDraft(serverKey: serverKey, directory: projectDirectory)
    activate(tab)
  }

  private func activate(_ tab: WorkspaceTab) {
    workspace.select(tab.id)
    switch tab.kind {
    case .draft:
      state.sessionLoadingID = UUID()
      state.messageStore.resetStreaming()
      state.messages = []
      state.partsByMessage = [:]
      state.currentSessionID = nil
    case .session:
      guard
        let sessionID = tab.sessionID,
        let session = state.sessions.first(where: { $0.id == sessionID })
      else { return }
      state.selectSession(session)
    }
  }

  private func rename(_ tab: WorkspaceTab, title: String) {
    guard tab.kind == .session, let sessionID = tab.sessionID else { return }
    Task { await state.updateSessionTitle(sessionID: sessionID, title: title) }
  }

  private func submitDraft(
    _ tab: WorkspaceTab,
    text: String,
    attachments: [ComposerImageAttachment]
  ) async -> Bool {
    guard workspace.selectedTabID == tab.id else { return false }
    guard let session = await state.createSession() else { return false }
    workspace.promoteDraft(tab.id, to: session)
    state.setDraftText("", for: draftStorageID(for: tab))
    return await state.sendMessage(text, attachments: attachments)
  }

  private func draftStorageID(for tab: WorkspaceTab) -> String {
    "workspace-draft-\(tab.id.uuidString)"
  }
}
