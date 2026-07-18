//
//  V2API.swift
//  VibePad
//
//  Wire models for the OpenCode v2 API (`/api/*`) and mapping onto the
//  app's view-facing models. The v2 contract is generated from typed
//  Effect schemas server-side, so decoding here is strict; the legacy
//  multi-shape fallbacks are not needed for these endpoints.
//

import Foundation

nonisolated enum V2API {
  /// Most v2 responses wrap the payload as `{location?, data, cursor?}`.
  struct DataEnvelope<T: Decodable>: Decodable {
    let data: T
  }

  /// `{id, providerID, variant?}` — note the v2 `id` is the legacy `modelID`.
  struct ModelRef: Codable, Sendable {
    let id: String
    let providerID: String
    let variant: String?

    init(id: String, providerID: String, variant: String? = nil) {
      self.id = id
      self.providerID = providerID
      self.variant = variant
    }
  }

  /// Server timestamps are JSON numbers (epoch milliseconds, possibly fractional).
  struct Timestamp: Codable, Sendable {
    let milliseconds: Int

    init(from decoder: Decoder) throws {
      let value = try decoder.singleValueContainer().decode(Double.self)
      milliseconds = Int(value)
    }

    func encode(to encoder: Encoder) throws {
      var container = encoder.singleValueContainer()
      try container.encode(Double(milliseconds))
    }
  }

  // MARK: - Session messages (GET /api/session/{id}/message)

  /// One entry of the `SessionMessage` union. Kinds the chat does not
  /// render (system, synthetic, compaction, agent/model switches) decode
  /// too and are dropped during mapping.
  struct SessionMessage: Decodable {
    let id: String
    let type: String
    let time: Time?
    // user
    let text: String?
    let files: [FileAttachment]?
    // assistant
    let agent: String?
    let model: ModelRef?
    let content: [ContentItem]?
    let finish: String?
    let cost: Double?
    let tokens: Tokens?
    let error: ErrorInfo?

    struct Time: Decodable {
      let created: Timestamp
      let completed: Timestamp?
    }

    struct Tokens: Decodable {
      let input: Int
      let output: Int
      let reasoning: Int
      let cache: TokenCache?
    }

    struct TokenCache: Decodable {
      let read: Int
      let write: Int
    }

    struct FileAttachment: Decodable {
      let uri: String
      let mime: String?
      let name: String?
    }

    struct ErrorInfo: Decodable {
      let type: String?
      let message: String?
    }

    struct ContentItem: Decodable {
      let type: String  // "text" | "reasoning" | "tool"
      let id: String
      let text: String?
      // tool
      let name: String?
      let state: ToolState?
    }

    struct ToolState: Decodable {
      let status: String  // "pending" | "running" | "completed" | "error"
      let input: [String: AnyCodable]?
      let content: [ToolContent]?
      let error: ErrorInfo?
    }

    struct ToolContent: Decodable {
      let type: String?
      let text: String?
    }
  }

  struct SessionMessagesResponse: Decodable {
    let data: [SessionMessage]
  }

  // MARK: - Permissions (GET /api/permission/request, permission.v2.asked)

  struct PermissionRequest: Decodable, Sendable {
    let id: String
    let sessionID: String
    let action: String
    let resources: [String]
    let save: [String]?
    let source: Source?

    struct Source: Decodable, Sendable {
      let type: String?
      let messageID: String?
      let callID: String?
    }
  }

  // MARK: - Agents / commands (GET /api/agent, GET /api/command)

  struct Agent: Decodable {
    let id: String
    let description: String?
    let mode: String
    let hidden: Bool
  }

  struct Command: Decodable {
    let name: String
    let template: String
    let description: String?
    let agent: String?
    let model: ModelRef?
    let subtask: Bool?
  }

  // MARK: - File system (GET /api/fs/list, /api/fs/find)

  struct FsEntry: Decodable {
    let path: String
    let type: String  // "file" | "directory"
  }

  // MARK: - Prompt (POST /api/session/{id}/prompt)

  struct PromptBody: Encodable {
    let prompt: PromptInput

    struct PromptInput: Encodable {
      let text: String
      let files: [FileInput]?
    }

    struct FileInput: Encodable {
      let uri: String
      let name: String?
    }
  }

  struct Provider: Decodable, Sendable {
    let id: String
    let name: String
  }

  struct Model: Decodable, Sendable {
    let id: String
    let providerID: String
    let name: String
    let capabilities: Capabilities?
    let status: String?
    let enabled: Bool?

    struct Capabilities: Decodable, Sendable {
      let input: [String]
      let output: [String]
    }

    var acceptsImages: Bool { capabilities?.input.contains("image") ?? false }
    var acceptsPDF: Bool { capabilities?.input.contains("pdf") ?? false }
    var isSelectable: Bool {
      let isEnabled = enabled ?? true
      return isEnabled && status != "deprecated"
    }
  }
}

// MARK: - Mapping to view-facing models

nonisolated extension V2API.SessionMessage {
  /// Maps a v2 session message onto the legacy view model. Returns nil for
  /// message kinds the chat does not render.
  func toMessageWithParts(sessionID: String) -> MessageWithParts? {
    switch type {
    case "user":
      return userMessage(sessionID: sessionID)
    case "assistant":
      return assistantMessage(sessionID: sessionID)
    default:
      return nil
    }
  }

  private func userMessage(sessionID: String) -> MessageWithParts {
    let info = Message(
      id: id,
      sessionID: sessionID,
      role: "user",
      parentID: nil,
      providerID: nil,
      modelID: nil,
      model: nil,
      error: nil,
      time: Message.TimeInfo(created: time?.created.milliseconds ?? 0, completed: time?.completed?.milliseconds),
      finish: nil,
      tokens: nil,
      cost: nil
    )

    var parts: [Part] = []
    if let text, !text.isEmpty {
      parts.append(
        Part(
          id: "\(id)-text",
          messageID: id,
          sessionID: sessionID,
          type: "text",
          text: text,
          tool: nil,
          callID: nil,
          state: nil,
          metadata: nil,
          files: nil
        ))
    }
    for (index, file) in (files ?? []).enumerated() {
      parts.append(
        Part(
          id: "\(id)-file-\(index)",
          messageID: id,
          sessionID: sessionID,
          type: "file",
          text: nil,
          tool: nil,
          callID: nil,
          state: nil,
          metadata: nil,
          files: nil,
          mime: file.mime,
          filename: file.name,
          url: file.uri
        ))
    }
    return MessageWithParts(info: info, parts: parts)
  }

  private func assistantMessage(sessionID: String) -> MessageWithParts {
    let modelInfo = model.map { Message.ModelInfo(providerID: $0.providerID, modelID: $0.id) }
    let messageError = error.flatMap { info -> Message.MessageError? in
      guard let message = info.message else { return nil }
      return Message.MessageError(name: info.type ?? "unknown", data: ["message": AnyCodable(message)])
    }
    let tokenInfo = tokens.map {
      Message.TokenInfo(
        input: $0.input,
        output: $0.output,
        reasoning: $0.reasoning,
        cache: $0.cache.map { Message.TokenInfo.CacheInfo(read: $0.read, write: $0.write) }
      )
    }
    let info = Message(
      id: id,
      sessionID: sessionID,
      role: "assistant",
      parentID: nil,
      providerID: model?.providerID,
      modelID: model?.id,
      model: modelInfo,
      error: messageError,
      time: Message.TimeInfo(created: time?.created.milliseconds ?? 0, completed: time?.completed?.milliseconds),
      finish: finish,
      tokens: tokenInfo,
      cost: cost
    )

    let parts = (content ?? []).compactMap { item -> Part? in
      switch item.type {
      case "text", "reasoning":
        guard let text = item.text else { return nil }
        return Part(
          id: item.id,
          messageID: id,
          sessionID: sessionID,
          type: item.type,
          text: text,
          tool: nil,
          callID: nil,
          state: nil,
          metadata: nil,
          files: nil
        )
      case "tool":
        let outputText = item.state?.content?
          .compactMap { $0.text }
          .joined(separator: "\n")
        let errorText = item.state?.error?.message
        let bridge = PartStateBridge(
          v2Status: item.state?.status ?? "pending",
          input: item.state?.input?.mapValues { $0.value },
          outputText: (outputText?.isEmpty ?? true) ? errorText : outputText
        )
        return Part(
          id: item.id,
          messageID: id,
          sessionID: sessionID,
          type: "tool",
          text: nil,
          tool: item.name,
          callID: item.id,
          state: bridge,
          metadata: nil,
          files: nil
        )
      default:
        return nil
      }
    }
    return MessageWithParts(info: info, parts: parts)
  }
}

nonisolated extension V2API.PermissionRequest {
  var asLegacyRequest: APIClient.PermissionRequest {
    APIClient.PermissionRequest(
      id: id,
      sessionID: sessionID,
      permission: action,
      patterns: resources,
      metadata: nil,
      always: save,
      tool: APIClient.PermissionRequest.ToolRef(messageID: source?.messageID, callID: source?.callID)
    )
  }
}

nonisolated extension V2API.Agent {
  var asAgentInfo: AgentInfo {
    AgentInfo(name: id, description: description, mode: mode, hidden: hidden, native: true)
  }
}

nonisolated extension V2API.Command {
  var asOpenCodeCommand: OpenCodeCommand {
    OpenCodeCommand(
      name: name,
      description: description,
      agent: agent,
      model: model.map { "\($0.providerID)/\($0.id)" },
      source: nil,
      template: template,
      subtask: subtask,
      hints: []
    )
  }
}

nonisolated extension V2API.FsEntry {
  var asFileNode: FileNode {
    let name = path.split(separator: "/").last.map(String.init) ?? path
    return FileNode(name: name, path: path, absolute: nil, type: type, ignored: nil)
  }
}
