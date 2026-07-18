//
//  ChatTabView.swift
//  VibePad
//

import SwiftUI

private enum MessageGroupItem: Identifiable {
  case user(MessageWithParts)
  case assistantMerged([MessageWithParts])

  var id: String {
    switch self {
    case .user(let m): return "user-\(m.info.id)"
    case .assistantMerged(let msgs): return "assistant-\(msgs.map(\.info.id).joined(separator: "-"))"
    }
  }

  var messageIDs: [String] {
    switch self {
    case .user(let m): return [m.info.id]
    case .assistantMerged(let msgs): return msgs.map { $0.info.id }
    }
  }
}

struct ChatTabView: View {
  /// Merges the pre-recording draft with the live speech transcript:
  /// no separator after an empty or space-terminated prefix, one space
  /// otherwise.
  nonisolated static func mergedSpeechInput(prefix: String, transcript: String) -> String {
    guard !transcript.isEmpty else { return prefix }
    let separator = prefix.isEmpty || prefix.hasSuffix(" ") ? "" : " "
    return prefix + separator + transcript
  }

  @Bindable var state: AppState
  var showSettingsInToolbar: Bool = false
  var showSessionListInToolbar: Bool = true
  var showCreateSessionInToolbar: Bool = true
  var showsHeader: Bool = true
  var draftStorageID: String?
  var draftAccessory: AnyView?
  var onSubmitDraft: ((String, [ComposerImageAttachment]) async -> Bool)?
  var onSettingsTap: (() -> Void)?
  @State var inputText = ""
  @State private var isSyncingDraft = false
  @State private var showSessionList = false
  @State private var showRenameAlert = false
  @State private var renameText = ""
  @State private var messageScroller = SCMessageScrollerState()
  @Environment(\.horizontalSizeClass) private var sizeClass
  @Environment(\.colorScheme) private var colorScheme

  private var useGridCards: Bool { sizeClass == .regular }

  fileprivate struct TurnActivity: Identifiable {
    enum State {
      case running
      case completed
    }

    let id: String  // userMessageID
    let state: State
    let text: String
    let startedAt: Date
    let endedAt: Date?

    func elapsedSeconds(now: Date = Date()) -> Int {
      let end = endedAt ?? now
      return max(0, Int(end.timeIntervalSince(startedAt)))
    }

    func elapsedString(now: Date = Date()) -> String {
      let secs = elapsedSeconds(now: now)
      return String(format: "%d:%02d", secs / 60, secs % 60)
    }
  }

  private enum ChatItem: Identifiable {
    case group(MessageGroupItem)
    case activity(TurnActivity)

    var id: String {
      switch self {
      case .group(let g): return "g-\(g.id)"
      case .activity(let a): return "a-\(a.id)"
      }
    }

    /// User turns are the scroller's turn boundaries: a fresh user
    /// message settles near the viewport top with a peek of the
    /// previous exchange, matching upstream MessageScroller behavior.
    var isUserTurn: Bool {
      guard case .group(let group) = self, case .user = group else { return false }
      return true
    }
  }

  private var currentPermissions: [PendingPermission] {
    state.pendingPermissions.filter { $0.sessionID == state.currentSessionID }
  }

  private var currentQuestions: [QuestionRequest] {
    state.pendingQuestions.filter { $0.sessionID == state.currentSessionID }
  }

  private var isCurrentSessionBusy: Bool {
    guard let status = state.currentSessionStatus else { return false }
    return status.type == "busy" || status.type == "retry"
  }

  private var lastUserMessageIDInCurrentSession: String? {
    guard let sid = state.currentSessionID else { return nil }
    return state.messages.last(where: { $0.info.sessionID == sid && $0.info.isUser })?.info.id
  }

  private enum TurnActivityMode {
    case completedOnly
    case runningOnly
  }

  private func turnActivitiesForCurrentSession(_ mode: TurnActivityMode) -> [TurnActivity] {
    guard let sid = state.currentSessionID else { return [] }
    let msgs = state.messages

    var userIndices: [Int] = []
    userIndices.reserveCapacity(64)
    for (i, m) in msgs.enumerated() {
      if m.info.sessionID == sid, m.info.isUser {
        userIndices.append(i)
      }
    }
    if userIndices.isEmpty { return [] }

    let lastUserID = lastUserMessageIDInCurrentSession

    var result: [TurnActivity] = []
    result.reserveCapacity(userIndices.count)

    for (pos, ui) in userIndices.enumerated() {
      let userMsg = msgs[ui]
      let nextUserIndex = (pos + 1 < userIndices.count) ? userIndices[pos + 1] : msgs.count

      var lastAssistant: Message?
      var lastCompletedAssistant: Message?
      for j in (ui + 1)..<nextUserIndex {
        let m = msgs[j]
        if m.info.isAssistant {
          lastAssistant = m.info
          if m.info.time.completed != nil {
            lastCompletedAssistant = m.info
          }
        }
      }

      let startedAt = Date(timeIntervalSince1970: Double(userMsg.info.time.created) / 1000.0)

      let completedAt: Date? = {
        guard let completed = lastCompletedAssistant?.time.completed else { return nil }
        return Date(timeIntervalSince1970: Double(completed) / 1000.0)
      }()
      let fallbackEndAt: Date? = {
        guard let created = lastAssistant?.time.created else { return nil }
        return Date(timeIntervalSince1970: Double(created) / 1000.0)
      }()
      let endedAt = completedAt ?? fallbackEndAt

      let isLatestTurn = (userMsg.info.id == lastUserID)
      let isRunning = isLatestTurn && isCurrentSessionBusy

      switch mode {
      case .runningOnly:
        guard isRunning else { continue }
        result.append(
          TurnActivity(
            id: userMsg.info.id,
            state: .running,
            text: state.activityTextForSession(sid),
            startedAt: startedAt,
            endedAt: nil
          )
        )
      case .completedOnly:
        guard !isRunning else { continue }
        // Only show a completed row if we have at least one assistant message for this turn.
        guard lastAssistant != nil else { continue }
        result.append(
          TurnActivity(
            id: userMsg.info.id,
            state: .completed,
            text: L10n.t(.chatTurnCompleted),
            startedAt: startedAt,
            endedAt: endedAt
          )
        )
      }
    }

    return result
  }

  private var chatItems: [ChatItem] {
    // Completed activity rows interleaved after each assistant turn.
    let activities = turnActivitiesForCurrentSession(.completedOnly)
    let activityByUserID: [String: TurnActivity] = activities.reduce(into: [:]) { result, activity in
      result[activity.id] = activity
    }

    var items: [ChatItem] = []
    var currentUserID: String?
    var seenAssistantForCurrentUser = false
    for group in messageGroups {
      switch group {
      case .user(let msg):
        if let uid = currentUserID,
          seenAssistantForCurrentUser,
          let a = activityByUserID[uid]
        {
          items.append(.activity(a))
        }
        currentUserID = msg.info.id
        seenAssistantForCurrentUser = false
        items.append(.group(group))
      case .assistantMerged:
        if currentUserID != nil {
          seenAssistantForCurrentUser = true
        }
        items.append(.group(group))
      }
    }

    if let uid = currentUserID,
      seenAssistantForCurrentUser,
      let a = activityByUserID[uid]
    {
      items.append(.activity(a))
    }
    return items
  }

  private var runningTurnActivity: TurnActivity? {
    turnActivitiesForCurrentSession(.runningOnly).last
  }

  private var showLoadMoreHint: Bool {
    state.isCurrentSessionHistoryTruncated || state.isLoadingOlderMessagesInCurrentSession
  }

  /// Merge consecutive step-only messages within the same assistant turn so tool cards display contiguously in one grid
  private var messageGroups: [MessageGroupItem] {
    let visibleMessages = AppState.visibleMessages(
      state.messages,
      revertMessageID: state.currentSession?.revert?.messageID
    )
    var result: [MessageGroupItem] = []
    var i = 0
    while i < visibleMessages.count {
      let msg = visibleMessages[i]
      if msg.info.isUser {
        result.append(.user(msg))
        i += 1
        continue
      }
      var assistantBatch: [MessageWithParts] = []
      while i < visibleMessages.count {
        let m = visibleMessages[i]
        if m.info.isUser { break }
        assistantBatch.append(m)
        i += 1
        if m.parts.contains(where: { $0.isText }) { break }
      }
      if !assistantBatch.isEmpty {
        result.append(.assistantMerged(assistantBatch))
      }
    }
    return result
  }

  private var composerStatusText: String? {
    guard state.isBusy else { return nil }
    return runningTurnActivity?.text ?? L10n.t(.chatAgentRunning)
  }

  private var quietComposerStatus: some View {
    Group {
      if let activity = runningTurnActivity {
        TimelineView(.periodic(from: .now, by: 1)) { context in
          quietComposerStatusRow(activity: activity, now: context.date)
        }
      } else {
        quietComposerStatusRow(activity: nil, now: Date())
      }
    }
    .padding(.horizontal, DesignSpacing.xs)
    .padding(.top, DesignSpacing.xs)
    .padding(.bottom, DesignSpacing.sm)
  }

  private func quietComposerStatusRow(activity: TurnActivity?, now: Date) -> some View {
    HStack(spacing: DesignSpacing.sm) {
      if state.isBusy {
        Circle()
          .fill(DesignColors.Brand.gold)
          .frame(width: 6, height: 6)
          .shadow(color: DesignColors.Brand.gold.opacity(0.25), radius: 4)
      }

      Text(composerStatusText ?? "")
        .font(DesignTypography.meta)
        .foregroundStyle(DesignColors.Neutral.textSecondary)
        .lineLimit(1)

      Spacer(minLength: 0)

      if let activity {
        Text(activity.elapsedString(now: now))
          .font(DesignTypography.meta)
          .monospacedDigit()
          .foregroundStyle(DesignColors.Neutral.textTertiary)
      }

      if state.isBusy {
        Menu {
          Button(role: .destructive) {
            Task { await state.abortSession() }
          } label: {
            Label(L10n.t(.chatAbortAgent), systemImage: "stop.fill")
          }
        } label: {
          Image(systemName: "ellipsis")
            .font(DesignTypography.meta.weight(.semibold))
            .foregroundStyle(DesignColors.Neutral.textTertiary)
            .frame(width: 30, height: 24)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("agent-interrupt-menu")
        .accessibilityLabel(L10n.t(.chatAbortAgent))
      }
    }
  }

  private var shouldShowComposerStatus: Bool {
    composerStatusText != nil
  }

  var body: some View {
    VStack(spacing: 0) {
      if showsHeader {
        ChatToolbarView(
          state: state,
          showSessionList: $showSessionList,
          showRenameAlert: $showRenameAlert,
          renameText: $renameText,
          showSettingsInToolbar: showSettingsInToolbar,
          showSessionListInToolbar: showSessionListInToolbar,
          showCreateSessionInToolbar: showCreateSessionInToolbar,
          onSettingsTap: onSettingsTap
        )
      }

      SCMessageScroller(state: messageScroller) {
        SCMessageScrollerViewport {
          SCMessageScrollerContent {
            VStack(alignment: .leading, spacing: DesignSpacing.messageVertical) {
              if showLoadMoreHint {
                HStack(spacing: 8) {
                  if state.isLoadingOlderMessagesInCurrentSession {
                    ProgressView()
                      .controlSize(.small)
                  }
                  Text(
                    state.isLoadingOlderMessagesInCurrentSession
                      ? L10n.t(.chatLoadingMoreHistory)
                      : L10n.t(.chatPullToLoadMore)
                  )
                  .font(.caption)
                  .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 2)
              }

              if messageGroups.isEmpty {
                emptySessionStateView
              } else {
                ForEach(chatItems) { item in
                  SCMessageScrollerItem(messageId: item.id, scrollAnchor: item.isUserTurn) {
                    switch item {
                    case .group(let group):
                      switch group {
                      case .user(let msg):
                        MessageRowView(
                          state: state,
                          message: msg,
                          sessionTodos: state.sessionTodos[msg.info.sessionID] ?? [],
                          workspaceDirectory: state.currentSession?.directory,
                          onOpenResolvedPath: openFileInChat,
                          onOpenFilesTab: openFilesTab,
                          onForkFromMessage: { messageID in
                            Task { await state.forkSession(messageID: messageID) }
                          },
                          onEditFromMessage: { messageID in
                            Task {
                              guard let draft = await state.editFromMessage(messageID: messageID) else { return }
                              inputText = draft
                            }
                          }
                        )
                      case .assistantMerged(let msgs):
                        if let first = msgs.first {
                          let merged = MessageWithParts(info: first.info, parts: msgs.flatMap(\.parts))
                          MessageRowView(
                            state: state,
                            message: merged,
                            sessionTodos: state.sessionTodos[merged.info.sessionID] ?? [],
                            workspaceDirectory: state.currentSession?.directory,
                            onOpenResolvedPath: openFileInChat,
                            onOpenFilesTab: openFilesTab,
                            onForkFromMessage: { messageID in
                              Task { await state.forkSession(messageID: messageID) }
                            },
                            onEditFromMessage: { messageID in
                              Task {
                                guard let draft = await state.editFromMessage(messageID: messageID) else { return }
                                inputText = draft
                              }
                            }
                          )
                        }
                      }
                    case .activity(let a):
                      TurnActivityRowView(activity: a)
                    }
                  }
                  .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
              }
              if let streamingPart = state.streamingReasoningPart {
                StreamingReasoningView(part: streamingPart, state: state)
                  .padding(.top, 6)
              }

              if useGridCards {
                LazyVGrid(
                  columns: Array(repeating: GridItem(.flexible(), spacing: DesignSpacing.sm), count: 3),
                  alignment: .leading,
                  spacing: DesignSpacing.sm
                ) {
                  ForEach(currentPermissions) { perm in
                    PermissionCardView(permission: perm) { response in
                      Task { await state.respondPermission(perm, response: response) }
                    }
                  }
                }
                ForEach(currentQuestions) { question in
                  QuestionCardView(
                    request: question,
                    onReply: { answers in
                      Task { await state.respondQuestion(question, answers: answers) }
                    },
                    onReject: {
                      Task { await state.rejectQuestion(question) }
                    }
                  )
                }
              } else {
                ForEach(currentPermissions) { perm in
                  PermissionCardView(permission: perm) { response in
                    Task { await state.respondPermission(perm, response: response) }
                  }
                }
                ForEach(currentQuestions) { question in
                  QuestionCardView(
                    request: question,
                    onReply: { answers in
                      Task { await state.respondQuestion(question, answers: answers) }
                    },
                    onReject: {
                      Task { await state.rejectQuestion(question) }
                    }
                  )
                }
              }

            }
            .padding()
          }
        }
        .refreshable {
          await state.loadOlderMessagesForCurrentSession()
        }

        SCMessageScrollerButton(direction: .end) {
          Image(systemName: "arrow.down")
        }
      }
      .overlay(alignment: .leading) {
        if sizeClass != .regular {
          Color.clear
            .frame(width: SessionListEdgeSwipeBehavior.edgeThreshold)
            .contentShape(Rectangle())
            .gesture(sessionListEdgeSwipeGesture)
            .accessibilityHidden(true)
        }
      }

      Divider()
        .opacity(0.5)
      VStack(spacing: 6) {
        if shouldShowComposerStatus { quietComposerStatus }
        if let draftAccessory { draftAccessory }
        SessionComposer(state: state, text: $inputText, onSubmit: submitComposer)
          .accessibilityIdentifier("chat-input")
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(colorScheme == .dark ? DesignColors.Neutral.composerDark : DesignColors.Neutral.composerLight)
      .clipShape(RoundedRectangle(cornerRadius: DesignCorners.large))
      .padding(.horizontal, DesignControls.composerContainerHorizontalPadding)
      .padding(.vertical, DesignControls.composerContainerVerticalPadding)
      .background(.bar)
    }
    .sheet(isPresented: $showSessionList) {
      SessionListView(state: state)
    }
    .alert(
      L10n.t(.chatSendFailed),
      isPresented: Binding(
        get: { state.sendError != nil },
        set: { if !$0 { state.sendError = nil } }
      )
    ) {
      Button(L10n.t(.commonOk)) { state.sendError = nil }
    } message: {
      if let error = state.sendError {
        Text(error)
      }
    }
    .alert(L10n.t(.chatRenameSession), isPresented: $showRenameAlert) {
      TextField(L10n.t(.chatTitleField), text: $renameText)
      Button(L10n.t(.commonCancel), role: .cancel) { showRenameAlert = false }
      Button(L10n.t(.commonOk)) {
        guard let id = state.currentSessionID else { return }
        Task { await state.updateSessionTitle(sessionID: id, title: renameText) }
        showRenameAlert = false
      }
    } message: {
      Text(L10n.t(.chatRenameSessionPlaceholder))
    }
    .onAppear {
      Task { @MainActor in
        syncDraftFromState(sessionID: composerStorageID)
      }
    }
    .onChange(of: state.currentSessionID) { oldID, newID in
      let draftText = inputText
      Task { @MainActor in
        await Task.yield()
        state.setDraftText(draftText, for: oldID)
        syncDraftFromState(sessionID: draftStorageID ?? newID)
        messageScroller.scrollToEnd(animated: false)
      }
    }
    .onChange(of: inputText) { _, newValue in
      guard !isSyncingDraft else { return }
      Task { @MainActor in
        await Task.yield()
        guard !isSyncingDraft, inputText == newValue else { return }
        state.setDraftText(newValue, for: composerStorageID)
      }
    }
  }

  private var composerStorageID: String? {
    draftStorageID ?? state.currentSessionID
  }

  private func syncDraftFromState(sessionID: String?) {
    isSyncingDraft = true
    inputText = state.draftText(for: sessionID)
    isSyncingDraft = false
  }

  private func submitComposer(_ text: String, attachments: [ComposerImageAttachment]) async -> Bool {
    if let onSubmitDraft {
      return await onSubmitDraft(text, attachments)
    }
    return await state.sendMessage(text, attachments: attachments)
  }

  @ViewBuilder
  private var emptySessionStateView: some View {
    if state.currentSessionID == nil && draftStorageID == nil {
      VStack(spacing: DesignSpacing.md) {
        Image(systemName: "bubble.left.and.bubble.right.fill")
          .font(.system(size: 48))
          .foregroundStyle(DesignColors.Brand.primary.opacity(0.2))
        Text(L10n.t(.chatSelectSessionFirst))
          .font(DesignTypography.headline)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      .padding(.top, 60)
      .frame(maxWidth: .infinity)
    } else if isCurrentSessionBusy {
      // If busy but there is no user turn yet, show a lightweight placeholder.
      if lastUserMessageIDInCurrentSession == nil {
        HStack(spacing: 10) {
          ProgressView()
          Text(L10n.t(.chatSessionBusyMessage))
            .font(DesignTypography.meta)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 18)
      }
    } else {
      VStack(spacing: DesignSpacing.md) {
        if draftStorageID != nil {
          Text("VIBEPAD")
            .font(.system(size: 64, weight: .black, design: .rounded))
            .tracking(-4)
            .foregroundStyle(.secondary.opacity(0.14))
            .accessibilityHidden(true)
        } else {
          Image(systemName: "sparkles")
            .font(.system(size: 48))
            .foregroundStyle(DesignColors.Brand.gold.opacity(0.3))
          Text(L10n.t(.chatNoMessages))
            .font(DesignTypography.headline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
      }
      .padding(.top, 60)
      .frame(maxWidth: .infinity)
    }
  }

  private func statusColor(_ status: SessionStatus) -> Color {
    switch status.type {
    case "busy": return DesignColors.Brand.primary
    case "error": return DesignColors.Semantic.error
    default: return DesignColors.Semantic.success
    }
  }

  private func statusLabel(_ status: SessionStatus) -> String {
    switch status.type {
    case "busy": return L10n.t(.chatSessionStatusBusy)
    case "retry": return L10n.t(.chatSessionStatusRetrying)
    default: return L10n.t(.chatSessionStatusIdle)
    }
  }

  private func openFileInChat(_ resolvedPath: String) {
    guard !resolvedPath.isEmpty else { return }
    if sizeClass == .regular {
      state.previewFilePath = resolvedPath
      state.fileToOpenInFilesTab = nil
    } else {
      state.fileToOpenInFilesTab = resolvedPath
      state.selectedTab = 1
    }
  }

  private func openFilesTab() {
    state.selectedTab = 1
  }

  private var sessionListEdgeSwipeGesture: some Gesture {
    DragGesture(minimumDistance: 20, coordinateSpace: .local)
      .onEnded { value in
        guard sizeClass != .regular else { return }
        guard !showSessionList else { return }
        guard
          SessionListEdgeSwipeBehavior.shouldOpenSessionList(
            startLocation: value.startLocation,
            translation: value.translation
          )
        else { return }
        showSessionList = true
      }
  }
}

private struct TurnActivityRowView: View {
  let activity: ChatTabView.TurnActivity

  var body: some View {
    Group {
      if activity.state == .running {
        TimelineView(.periodic(from: .now, by: 1)) { context in
          row(now: context.date)
        }
      } else {
        row(now: Date())
      }
    }
  }

  // Upstream Marker + shimmer is the canonical "tool activity / live
  // status" treatment; the shimmer runs only while the turn is running.
  private func row(now: Date) -> some View {
    let elapsed = activity.elapsedString(now: now)

    return HStack(spacing: DesignSpacing.sm) {
      SCMarker {
        SCMarkerIcon {
          Image(systemName: activity.state == .running ? "clock" : "checkmark.circle")
        }
        SCMarkerContent {
          Text(activity.text)
            .lineLimit(1)
            .truncationMode(.tail)
            .scShimmer(active: activity.state == .running)
        }
      }
      Spacer(minLength: 12)
      Text(elapsed)
        .font(DesignTypography.micro)
        .monospacedDigit()
        .foregroundStyle(DesignColors.Neutral.textTertiary)
    }
    .padding(.vertical, DesignSpacing.sm)
  }
}
