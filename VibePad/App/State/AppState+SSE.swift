import Foundation
import os

/// Server-sent events: connection lifecycle with backoff reconnect,
/// per-event dispatch, polled status reconciliation, per-session
/// activity text debouncing, and the recovery paths triggered when an
/// event implies the current session was deleted server-side.
extension AppState {
  func connectSSE() {
    sseTask?.cancel()
    sseTask = Task {
      var attempt = 0
      while !Task.isCancelled {
        let info = Self.serverURLInfo(serverURL)
        guard info.isAllowed, let baseURL = info.normalized else {
          return
        }

        let stream = sseClient.connect(
          baseURL: baseURL,
          username: username.isEmpty ? nil : username,
          password: password.isEmpty ? nil : password
        )

        do {
          await bootstrapSyncCurrentSession(reason: "sse.reconnect")
          for try await event in stream {
            attempt = 0
            await handleSSEEvent(event)
          }
        } catch {
          // Reconnect with exponential backoff
          attempt += 1
          let base = min(30.0, pow(2.0, Double(attempt)))
          try? await Task.sleep(for: .seconds(base))
        }
      }
    }
  }

  func disconnectSSE() {
    sseTask?.cancel()
    sseTask = nil
  }

  // Note: AppState is typically held for the app's lifetime (as @State in root view),
  // so deinit-based cleanup is not critical. The disconnectSSE() method above
  // should be called explicitly when needed (e.g., on background/terminate).

  func handleSSEEvent(_ event: SSEEvent) async {
    let properties = event.properties

    guard !event.type.hasPrefix("session.next.") else {
      await handleSessionNextEvent(type: event.type, properties)
      return
    }

    switch event.type {
    case "server.connected":
      await syncSessionStatusesFromPoll(markMissingBusyAsIdle: true)
    case "session.status":
      handleSessionStatusEvent(properties)
    case "session.created", "session.updated":
      handleSessionUpdatedEvent(properties)
    case "session.deleted":
      await handleSessionDeletedEvent(properties)
    case "session.idle":
      handleSessionIdleEvent(properties)
    case "session.error":
      await handleSessionErrorEvent(properties)
    case "permission.v2.asked":
      handlePermissionAskedEvent(properties)
    case "permission.v2.replied":
      PermissionController.applyRepliedEvent(properties: properties, to: &pendingPermissions)
    case "question.v2.asked":
      handleQuestionAskedEvent(properties)
    case "question.v2.replied", "question.v2.rejected":
      QuestionController.applyResolvedEvent(properties: properties, to: &pendingQuestions)
    case "todo.updated":
      handleTodoUpdatedEvent(properties)
    default:
      break
    }
  }

  /// Run-lifecycle and streaming events emitted by the v2 session engine.
  private func handleSessionNextEvent(type: String, _ properties: [String: AnyCodable]) async {
    switch type {
    case "session.next.prompt.admitted", "session.next.prompted", "session.next.step.started",
      "session.next.shell.started":
      handleSessionRunActiveEvent(properties)
    case "session.next.retried":
      handleSessionRetriedEvent(properties)
    case "session.next.text.delta", "session.next.reasoning.delta":
      handleStreamDeltaEvent(type: type, properties)
    case "session.next.text.ended", "session.next.reasoning.ended":
      await handleStreamEndedEvent(properties)
    case "session.next.tool.called":
      await handleToolEvent(properties, reloadDiff: false)
    case "session.next.tool.success", "session.next.tool.failed":
      await handleToolEvent(properties, reloadDiff: true)
    case "session.next.step.ended":
      await handleStepEndedEvent(properties)
    case "session.next.step.failed":
      await handleStepFailedEvent(properties)
    default:
      break
    }
  }

  private func handleSessionStatusEvent(_ properties: [String: AnyCodable]) {
    guard
      let sessionID = properties["sessionID"]?.value as? String,
      let statusObject = properties["status"]?.value as? [String: Any],
      let statusData = try? JSONSerialization.data(withJSONObject: statusObject),
      let status = try? JSONDecoder().decode(SessionStatus.self, from: statusData)
    else { return }
    applySessionStatus(sessionID: sessionID, status: status)
  }

  /// Applies an event-derived status transition and drives the same
  /// bookkeeping the polled reconcile path uses.
  private func applySessionStatus(sessionID: String, status: SessionStatus) {
    let previousStatus = sessionStatuses[sessionID]
    guard previousStatus != status else { return }
    sessionStatuses[sessionID] = status
    sessionStatusUpdatedAt[sessionID] = Date()

    if previousStatus?.type != status.type || previousStatus?.message != status.message {
      Self.logger.debug(
        "session.status(sse) session=\(sessionID, privacy: .public) prev=\(previousStatus?.type ?? "nil", privacy: .public) next=\(status.type, privacy: .public)"
      )
    }

    updateSessionActivity(sessionID: sessionID, previous: previousStatus, current: status)
    if sessionID == currentSessionID, !isBusySession(status) {
      messageStore.resetStreaming()
    }
  }

  private func handleSessionIdleEvent(_ properties: [String: AnyCodable]) {
    guard let sessionID = properties["sessionID"]?.value as? String else { return }
    applySessionStatus(sessionID: sessionID, status: SessionStatus(type: "idle", attempt: nil, message: nil, next: nil))
  }

  private func handleSessionErrorEvent(_ properties: [String: AnyCodable]) async {
    guard let sessionID = properties["sessionID"]?.value as? String else { return }
    applySessionStatus(sessionID: sessionID, status: SessionStatus(type: "idle", attempt: nil, message: nil, next: nil))
    guard sessionID == currentSessionID else { return }
    messageStore.resetStreaming()
    await loadMessages()
  }

  /// Any run-lifecycle event implies the session is busy; the polled
  /// reconcile keeps this honest if a terminal event is missed.
  private func handleSessionRunActiveEvent(_ properties: [String: AnyCodable]) {
    guard let sessionID = properties["sessionID"]?.value as? String else { return }
    applySessionStatus(sessionID: sessionID, status: SessionStatus(type: "busy", attempt: nil, message: nil, next: nil))
  }

  private func handleSessionRetriedEvent(_ properties: [String: AnyCodable]) {
    guard let sessionID = properties["sessionID"]?.value as? String else { return }
    let attempt = properties["attempt"]?.value as? Int
    applySessionStatus(
      sessionID: sessionID, status: SessionStatus(type: "retry", attempt: attempt, message: nil, next: nil))
  }

  private func handleStreamDeltaEvent(type: String, _ properties: [String: AnyCodable]) {
    guard
      let sessionID = properties["sessionID"]?.value as? String,
      sessionID == currentSessionID,
      let messageID = properties["assistantMessageID"]?.value as? String,
      let delta = properties["delta"]?.value as? String,
      !delta.isEmpty
    else { return }

    let isReasoning = type == "session.next.reasoning.delta"
    let partID =
      (properties[isReasoning ? "reasoningID" : "textID"]?.value as? String) ?? "stream"
    messageStore.appendStreamingDelta(
      messageID: messageID,
      partID: partID,
      sessionID: sessionID,
      type: isReasoning ? "reasoning" : "text",
      delta: delta
    )
    if !isBusySession(sessionStatuses[sessionID]) {
      applySessionStatus(
        sessionID: sessionID, status: SessionStatus(type: "busy", attempt: nil, message: nil, next: nil))
    }
    refreshSessionActivityText(sessionID: sessionID)
  }

  /// `*.ended` events carry the final text, so the durable projection is
  /// complete: drop the typewriter buffer and reload the real message.
  private func handleStreamEndedEvent(_ properties: [String: AnyCodable]) async {
    guard
      let sessionID = properties["sessionID"]?.value as? String,
      sessionID == currentSessionID,
      let messageID = properties["assistantMessageID"]?.value as? String
    else { return }
    messageStore.clearStreamingState(messageID: messageID)
    await loadMessages()
    await loadSessionDiff()
  }

  private func handleToolEvent(_ properties: [String: AnyCodable], reloadDiff: Bool) async {
    guard
      let sessionID = properties["sessionID"]?.value as? String,
      sessionID == currentSessionID
    else { return }
    await loadMessages()
    if reloadDiff {
      await loadSessionDiff()
    }
    refreshSessionActivityText(sessionID: sessionID)
  }

  private func handleStepEndedEvent(_ properties: [String: AnyCodable]) async {
    guard let sessionID = properties["sessionID"]?.value as? String else { return }
    let finish = properties["finish"]?.value as? String
    // Intermediate steps end with finish == "tool-calls" and the run continues.
    guard finish != "tool-calls" else { return }
    applySessionStatus(sessionID: sessionID, status: SessionStatus(type: "idle", attempt: nil, message: nil, next: nil))
    guard sessionID == currentSessionID else { return }
    await loadMessages()
    await loadSessionDiff()
  }

  private func handleStepFailedEvent(_ properties: [String: AnyCodable]) async {
    guard let sessionID = properties["sessionID"]?.value as? String else { return }
    applySessionStatus(sessionID: sessionID, status: SessionStatus(type: "idle", attempt: nil, message: nil, next: nil))
    guard sessionID == currentSessionID else { return }
    messageStore.resetStreaming()
    await loadMessages()
  }

  private func handleSessionUpdatedEvent(_ properties: [String: AnyCodable]) {
    let value = properties["info"]?.value ?? properties["session"]?.value
    guard
      let value,
      JSONSerialization.isValidJSONObject(value),
      let data = try? JSONSerialization.data(withJSONObject: value),
      let session = try? JSONDecoder().decode(Session.self, from: data)
    else { return }

    let projectDirectory = effectiveProjectDirectory
    let belongsToCurrentContext = projectDirectory == nil || session.directory == projectDirectory
    guard belongsToCurrentContext || session.id == currentSessionID else {
      Self.logger.debug(
        "session.updated skip id=\(session.id, privacy: .public) dir=\(session.directory, privacy: .public) effectiveDir=\(projectDirectory ?? "nil", privacy: .public)"
      )
      return
    }
    guard sessions.first(where: { $0.id == session.id }) != session else { return }

    let operation = sessions.contains(where: { $0.id == session.id }) ? "replace" : "insert"
    Self.logger.debug(
      "session.updated id=\(session.id, privacy: .public) archived=\(session.time.archived.map { String($0) } ?? "nil", privacy: .public) dir=\(session.directory, privacy: .public) op=\(operation, privacy: .public)"
    )
    upsertSession(session)
  }

  private func handleSessionDeletedEvent(_ properties: [String: AnyCodable]) async {
    guard let sessionID = (properties["sessionID"]?.value as? String) ?? (properties["id"]?.value as? String)
    else {
      await loadSessions()
      return
    }
    Self.logger.debug("session.deleted id=\(sessionID, privacy: .public)")
    await handleRemoteSessionDeleted(sessionID: sessionID)
  }

  private func handlePermissionAskedEvent(_ properties: [String: AnyCodable]) {
    guard
      let permission = PermissionController.parseAskedEvent(properties: properties),
      !pendingPermissions.contains(where: { $0.id == permission.id })
    else { return }
    pendingPermissions.append(permission)
  }

  private func handleQuestionAskedEvent(_ properties: [String: AnyCodable]) {
    guard
      let question = QuestionController.parseAskedEvent(properties: properties),
      !pendingQuestions.contains(where: { $0.id == question.id })
    else { return }
    pendingQuestions.append(question)
  }

  private func handleTodoUpdatedEvent(_ properties: [String: AnyCodable]) {
    guard
      let sessionID = properties["sessionID"]?.value as? String,
      let todosObject = properties["todos"]?.value,
      JSONSerialization.isValidJSONObject(todosObject),
      let data = try? JSONSerialization.data(withJSONObject: todosObject),
      let todos = try? JSONDecoder().decode([TodoItem].self, from: data)
    else { return }
    sessionTodos[sessionID] = todos
  }

  func updateSessionActivity(sessionID: String, previous: SessionStatus?, current: SessionStatus) {
    sessionActivities[sessionID] = ActivityTracker.updateSessionActivity(
      sessionID: sessionID,
      previous: previous,
      current: current,
      existing: sessionActivities[sessionID],
      messages: messages,
      currentSessionID: currentSessionID,
      hasActiveStreaming: streamingReasoningPart?.sessionID == sessionID || messageStore.hasActiveStreaming
    )
  }

  func mergePolledSessionStatuses(_ statuses: [String: SessionStatus]) {
    mergePolledSessionStatuses(statuses, markMissingBusyAsIdle: true)
  }

  func mergePolledSessionStatuses(
    _ statuses: [String: SessionStatus],
    markMissingBusyAsIdle: Bool
  ) {
    let now = Date()
    for (sid, st) in statuses {
      if let updatedAt = sessionStatusUpdatedAt[sid], now.timeIntervalSince(updatedAt) < 5 {
        continue
      }
      let prev = sessionStatuses[sid]
      guard prev != st else { continue }

      sessionStatuses[sid] = st
      updateSessionActivity(sessionID: sid, previous: prev, current: st)
      if sid == currentSessionID, !isBusySession(st) {
        messageStore.resetStreaming()
      }
      if prev?.type != st.type {
        Self.logger.debug(
          "session.status(poll) session=\(sid, privacy: .public) prev=\(prev?.type ?? "nil", privacy: .public) next=\(st.type, privacy: .public)"
        )
      }
    }

    guard markMissingBusyAsIdle else { return }

    let existingSnapshot = sessionStatuses
    for (sid, prev) in existingSnapshot {
      guard statuses[sid] == nil else { continue }
      guard prev.type == "busy" || prev.type == "retry" else { continue }
      if let updatedAt = sessionStatusUpdatedAt[sid], now.timeIntervalSince(updatedAt) < 5 {
        continue
      }

      let idle = SessionStatus(type: "idle", attempt: nil, message: nil, next: nil)
      sessionStatuses[sid] = idle
      updateSessionActivity(sessionID: sid, previous: prev, current: idle)
      if sid == currentSessionID {
        messageStore.resetStreaming()
      }

      Self.logger.debug(
        "session.status(poll) session=\(sid, privacy: .public) prev=\(prev.type, privacy: .public) next=idle (missing from poll)"
      )
    }
  }

  func refreshSessionActivityText(sessionID: String) {
    guard isBusySession(sessionStatuses[sessionID]) else { return }
    guard sessionActivities[sessionID]?.state == .running else { return }
    let next = ActivityTracker.bestSessionActivityText(
      sessionID: sessionID,
      currentSessionID: currentSessionID,
      sessionStatuses: sessionStatuses,
      messages: messages,
      streamingReasoningPart: streamingReasoningPart,
      streamingPartTexts: streamingPartTexts
    )
    setSessionActivityText(sessionID: sessionID, next)
  }

  func setSessionActivityText(sessionID: String, _ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    guard var a = sessionActivities[sessionID], a.state == .running else { return }
    if a.text == trimmed { return }

    let now = Date()
    let delay = ActivityTracker.debounceDelay(lastChangeAt: activityTextLastChangeAt[sessionID], now: now)
    if delay == 0 {
      a.text = trimmed
      sessionActivities[sessionID] = a
      activityTextLastChangeAt[sessionID] = now
      activityTextPendingTask[sessionID]?.cancel()
      activityTextPendingTask[sessionID] = nil
      return
    }

    activityTextPendingTask[sessionID]?.cancel()
    activityTextPendingTask[sessionID] = Task { [weak self] in
      guard let self else { return }
      try? await Task.sleep(for: .seconds(delay))
      guard !Task.isCancelled else { return }
      guard self.isBusySession(self.sessionStatuses[sessionID]) else { return }
      let best = ActivityTracker.bestSessionActivityText(
        sessionID: sessionID,
        currentSessionID: self.currentSessionID,
        sessionStatuses: self.sessionStatuses,
        messages: self.messages,
        streamingReasoningPart: self.streamingReasoningPart,
        streamingPartTexts: self.streamingPartTexts
      )
      self.setSessionActivityText(sessionID: sessionID, best)
    }
  }

  func clearCurrentSessionViewState() {
    sessionLoadingID = UUID()
    messageStore.resetStreaming()
    messages = []
    partsByMessage = [:]
    sessionDiffs = []
  }

  func clearSessionScopedCaches(sessionID: String) {
    sessionStatuses[sessionID] = nil
    sessionTodos[sessionID] = nil
    sessionActivities[sessionID] = nil
    sessionStatusUpdatedAt[sessionID] = nil
    activityTextLastChangeAt[sessionID] = nil
    activityTextPendingTask[sessionID]?.cancel()
    activityTextPendingTask[sessionID] = nil
    loadedMessageLimitBySessionID[sessionID] = nil
    hasMoreHistoryBySessionID[sessionID] = nil
    loadingOlderMessagesSessionIDs.remove(sessionID)
    pendingPermissions.removeAll { $0.sessionID == sessionID }

    if streamingReasoningPart?.sessionID == sessionID {
      messageStore.streamingReasoningPart = nil
    }

    draftInputsBySessionID[sessionID] = nil
    if draftInputsBySessionID.isEmpty {
      defaults.removeObject(forKey: Self.draftInputsBySessionKey)
    } else if let data = try? JSONEncoder().encode(draftInputsBySessionID) {
      defaults.set(data, forKey: Self.draftInputsBySessionKey)
    }

    selectedModelIDBySessionID[sessionID] = nil
    persistSelectedModelMap()
  }

  func isSessionNotFoundError(_ error: Error) -> Bool {
    guard case APIError.httpError(let statusCode, _) = error else { return false }
    return statusCode == 404
  }

  func recoverFromMissingCurrentSessionIfNeeded(
    error: Error,
    requestedSessionID: String
  ) async -> Bool {
    guard requestedSessionID == currentSessionID else { return false }
    guard isSessionNotFoundError(error) else { return false }

    await loadSessions()

    guard currentSessionID != nil else {
      pendingPermissions = []
      return true
    }

    await loadMessages()
    await refreshPendingPermissions()
    await loadSessionDiff()
    await loadSessionTodos()
    syncModelFromMessageHistory()
    return true
  }

  func handleRemoteSessionDeleted(sessionID: String) async {
    let deletedCurrentSession = (sessionID == currentSessionID)

    sessions.removeAll { $0.id == sessionID }
    clearSessionScopedCaches(sessionID: sessionID)

    if deletedCurrentSession {
      clearCurrentSessionViewState()
    }

    await loadSessions()

    if deletedCurrentSession, currentSessionID != nil {
      await loadMessages()
      await refreshPendingPermissions()
      await loadSessionDiff()
      await loadSessionTodos()
      syncModelFromMessageHistory()
    } else if currentSessionID == nil {
      pendingPermissions = []
    } else {
      let validSessionIDs = Set(sessions.map(\.id))
      pendingPermissions.removeAll { !validSessionIDs.contains($0.sessionID) }
    }
  }

  func applySSEEventForTesting(_ event: SSEEvent) async {
    await handleSSEEvent(event)
  }
}
