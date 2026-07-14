//
//  MessageStore.swift
//  OpenCodeClient
//

import Foundation
import Observation

@Observable
final class MessageStore {
  var messages: [MessageWithParts] = []
  var partsByMessage: [String: [Part]] = [:]
  /// Delta accumulation: key = "messageID:partID", used for the typewriter effect
  var streamingPartTexts: [String: String] = [:]
  var streamingReasoningPart: Part?
  private var streamingDraftMessageIDs: Set<String> = []

  var hasActiveStreaming: Bool {
    streamingReasoningPart != nil || !streamingPartTexts.isEmpty || !streamingDraftMessageIDs.isEmpty
  }

  func resetStreaming() {
    streamingReasoningPart = nil
    streamingPartTexts = [:]
    streamingDraftMessageIDs.removeAll()
  }

  func isStreamingDraftMessage(_ messageID: String) -> Bool {
    streamingDraftMessageIDs.contains(messageID)
  }

  func removeStreamingDraftMessages(_ messageIDs: Set<String>) {
    streamingDraftMessageIDs.subtract(messageIDs)
  }

  func upsertStreamingMessage(
    messageID: String,
    partID: String,
    sessionID: String,
    type: String,
    text: String
  ) {
    let part = Part(
      id: partID,
      messageID: messageID,
      sessionID: sessionID,
      type: type,
      text: text,
      tool: nil,
      callID: nil,
      state: nil,
      metadata: nil,
      files: nil
    )

    if let idx = messages.firstIndex(where: { $0.info.id == messageID }) {
      let current = messages[idx]
      var updatedParts = current.parts
      if let partIdx = updatedParts.firstIndex(where: { $0.id == partID }) {
        updatedParts[partIdx] = part
      } else {
        updatedParts.append(part)
      }

      messages[idx] = MessageWithParts(info: current.info, parts: updatedParts)
      partsByMessage[messageID] = updatedParts
      streamingDraftMessageIDs.insert(messageID)
      return
    }

    let now = Int(Date().timeIntervalSince1970 * 1000)
    let message = Message(
      id: messageID,
      sessionID: sessionID,
      role: "assistant",
      parentID: messages.last?.info.id,
      providerID: nil,
      modelID: nil,
      model: nil,
      error: nil,
      time: Message.TimeInfo(created: now, completed: now),
      finish: nil,
      tokens: nil,
      cost: nil
    )

    messages.append(MessageWithParts(info: message, parts: [part]))
    partsByMessage[messageID] = [part]
    streamingDraftMessageIDs.insert(messageID)
  }

  func appendStreamingDelta(
    messageID: String,
    partID: String,
    sessionID: String,
    type: String,
    delta: String
  ) {
    let key = "\(messageID):\(partID)"
    let text = (streamingPartTexts[key] ?? "") + delta
    streamingPartTexts[key] = text

    if type == "reasoning" {
      streamingReasoningPart = Part(
        id: partID,
        messageID: messageID,
        sessionID: sessionID,
        type: "reasoning",
        text: nil,
        tool: nil,
        callID: nil,
        state: nil,
        metadata: nil,
        files: nil
      )
    } else {
      upsertStreamingMessage(
        messageID: messageID,
        partID: partID,
        sessionID: sessionID,
        type: type,
        text: text
      )
    }
  }

  func clearStreamingState(messageID: String) {
    for key in streamingPartTexts.keys where key.hasPrefix("\(messageID):") {
      streamingPartTexts.removeValue(forKey: key)
    }

    if streamingReasoningPart?.messageID == messageID {
      streamingReasoningPart = nil
    }
    streamingDraftMessageIDs.remove(messageID)
  }
}
