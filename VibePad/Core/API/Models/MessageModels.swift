//
//  Message.swift
//  VibePad
//

import Foundation

enum DisplayTextDecoder {
  nonisolated static func decodeJSONUnicodeEscapes(_ text: String) -> String {
    var result = ""
    var index = text.startIndex

    func hexDigit(_ character: Character) -> UInt32? {
      guard let value = character.unicodeScalars.first?.value else { return nil }
      if (48...57).contains(value) { return value - 48 }
      if (97...102).contains(value) { return value - 97 + 10 }
      if (65...70).contains(value) { return value - 65 + 10 }
      return nil
    }

    func hexValue(at start: String.Index) -> (value: UInt32, end: String.Index)? {
      var value: UInt32 = 0
      var cursor = start
      for _ in 0..<4 {
        guard cursor < text.endIndex, let digit = hexDigit(text[cursor]) else { return nil }
        value = value * 16 + digit
        cursor = text.index(after: cursor)
      }
      return (value, cursor)
    }

    while index < text.endIndex {
      guard text[index] == "\\" else {
        result.append(text[index])
        index = text.index(after: index)
        continue
      }

      let uIndex = text.index(after: index)
      guard uIndex < text.endIndex, text[uIndex] == "u" else {
        result.append(text[index])
        index = uIndex
        continue
      }

      let hexStart = text.index(after: uIndex)
      guard let first = hexValue(at: hexStart) else {
        result.append(text[index])
        index = uIndex
        continue
      }

      if (0xD800...0xDBFF).contains(first.value) {
        let slash = first.end
        if slash < text.endIndex,
          text[slash] == "\\"
        {
          let secondU = text.index(after: slash)
          if secondU < text.endIndex,
            text[secondU] == "u",
            let second = hexValue(at: text.index(after: secondU)),
            (0xDC00...0xDFFF).contains(second.value)
          {
            let scalar = 0x10000 + ((first.value - 0xD800) << 10) + (second.value - 0xDC00)
            if let unicodeScalar = UnicodeScalar(scalar) {
              result.append(Character(unicodeScalar))
              index = second.end
              continue
            }
          }
        }
      }

      if let unicodeScalar = UnicodeScalar(first.value) {
        result.append(Character(unicodeScalar))
        index = first.end
      } else {
        result.append(text[index])
        index = uIndex
      }
    }

    return result
  }
}

nonisolated struct Message: Codable, Identifiable {
  let id: String
  let sessionID: String
  let role: String
  let parentID: String?
  /// Some servers return providerID/modelID as top-level fields (instead of `model`).
  let providerID: String?
  let modelID: String?
  let model: ModelInfo?
  let error: MessageError?
  let time: TimeInfo
  let finish: String?
  let tokens: TokenInfo?
  let cost: Double?

  struct ModelInfo: Codable {
    let providerID: String
    let modelID: String
  }

  struct TokenInfo: Codable {
    let total: Int
    let input: Int
    let output: Int
    let reasoning: Int
    let cache: CacheInfo?

    struct CacheInfo: Codable {
      let read: Int
      let write: Int
    }

    private enum CodingKeys: String, CodingKey {
      case total
      case input
      case output
      case reasoning
      case cache
    }

    init(total: Int? = nil, input: Int, output: Int, reasoning: Int, cache: CacheInfo?) {
      self.input = input
      self.output = output
      self.reasoning = reasoning
      self.cache = cache
      self.total = total ?? (input + output + reasoning)
    }

    init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      input = try c.decodeIfPresent(Int.self, forKey: .input) ?? 0
      output = try c.decodeIfPresent(Int.self, forKey: .output) ?? 0
      reasoning = try c.decodeIfPresent(Int.self, forKey: .reasoning) ?? 0
      cache = try c.decodeIfPresent(CacheInfo.self, forKey: .cache)
      // Newer OpenCode server payloads may omit `total`.
      total = try c.decodeIfPresent(Int.self, forKey: .total) ?? (input + output + reasoning)
    }
  }

  struct TimeInfo: Codable {
    let created: Int
    let completed: Int?
  }

  struct MessageError: Codable {
    let name: String
    let data: [String: AnyCodable]

    var message: String? {
      if let msg = data["message"]?.value as? String { return msg }
      if let msg = data["error"]?.value as? String { return msg }
      return nil
    }
  }

  var isUser: Bool { role == "user" }
  var isAssistant: Bool { role == "assistant" }

  var resolvedModel: ModelInfo? {
    if let model { return model }
    if let providerID, let modelID { return ModelInfo(providerID: providerID, modelID: modelID) }
    return nil
  }

  var errorMessageForDisplay: String? {
    let trimmed = error?.message?.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.flatMap { $0.isEmpty ? nil : $0 }
  }
}

nonisolated struct MessageWithParts: Codable, @unchecked Sendable {
  let info: Message
  let parts: [Part]
}

nonisolated struct ComposerAttachment: Identifiable, Equatable, Sendable {
  let id: UUID
  let filename: String
  let mime: String
  let dataURL: String
  let thumbnailData: Data?
  let byteSize: Int

  var isImage: Bool { mime.hasPrefix("image/") }
}

typealias ComposerImageAttachment = ComposerAttachment

/// Part.state can be String (simple) or object (ToolState with status/title/input/output)
nonisolated struct PartStateBridge: Codable {
  let displayString: String
  /// Call reason/description, from state.title or state.metadata.description
  let title: String?
  /// Command/input, from state.input or state.metadata
  let inputSummary: String?
  /// Output result, from state.output or state.metadata.output
  let output: String?
  /// File path, from state.input.path/file_path/filePath or *** Add File: / *** Update File: in patchText
  let pathFromInput: String?

  /// For todowrite: updated todo list (if present)
  let todos: [TodoItem]?

  private struct DecodedObject {
    let displayString: String
    let title: String?
    let inputSummary: String?
    let output: String?
    let path: String?
    let todos: [TodoItem]?
  }

  private static func decodeTodos(from object: Any) -> [TodoItem]? {
    guard JSONSerialization.isValidJSONObject(object) else { return nil }
    guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
    return try? JSONDecoder().decode([TodoItem].self, from: data)
  }

  private static func decodeTodos(fromJSONText text: String?) -> [TodoItem]? {
    guard let text else { return nil }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode([TodoItem].self, from: data)
  }

  private static func stringValue(in dictionary: [String: Any], forKey key: String) -> String? {
    if let value = dictionary[key] as? String { return value }
    return (dictionary[key] as? [String])?.first
  }

  private static func inputDictionary(from value: Any) -> [String: Any]? {
    if let dictionary = value as? [String: Any] { return dictionary }
    return (value as? [String: AnyCodable])?.mapValues(\.value)
  }

  private static func filePath(from input: [String: Any]) -> String? {
    if let path = stringValue(in: input, forKey: "path")
      ?? stringValue(in: input, forKey: "file_path")
      ?? stringValue(in: input, forKey: "filePath")
    {
      return path
    }

    guard let patchText = stringValue(in: input, forKey: "patchText") else { return nil }
    for prefix in ["*** Add File: ", "*** Update File: "] {
      guard let range = patchText.range(of: prefix) else { continue }
      return String(patchText[range.upperBound...])
        .split(separator: "\n")
        .first
        .map(String.init)?
        .trimmingCharacters(in: .whitespaces)
    }
    return nil
  }

  private static func decodeInput(_ value: Any?) -> (summary: String?, path: String?, todos: [TodoItem]?) {
    guard let value else { return (nil, nil, nil) }
    if let text = value as? String { return (text, nil, nil) }
    guard let input = inputDictionary(from: value) else { return (nil, nil, nil) }
    let summary = stringValue(in: input, forKey: "command") ?? stringValue(in: input, forKey: "path")
    let todos = input["todos"].flatMap(decodeTodos(from:))
    return (summary, filePath(from: input), todos)
  }

  private static func decodeObject(_ dictionary: [String: AnyCodable]) -> DecodedObject {
    let displayString =
      (dictionary["status"]?.value as? String)
      ?? (dictionary["title"]?.value as? String)
      ?? "…"
    var title = dictionary["title"]?.value as? String
    var output = dictionary["output"]?.value as? String
    let metadata = dictionary["metadata"]?.value as? [String: Any]
    output = output ?? metadata?["output"] as? String
    title = title ?? metadata?["description"] as? String

    let input = decodeInput(dictionary["input"]?.value)
    let metadataTodos = metadata?["todos"].flatMap(decodeTodos(from:))
    let todos = input.todos ?? metadataTodos ?? decodeTodos(fromJSONText: output)
    return DecodedObject(
      displayString: displayString,
      title: title,
      inputSummary: input.summary,
      output: output,
      path: input.path,
      todos: todos
    )
  }

  /// Builds a bridge from a v2 tool state (`SessionMessageToolState*` /
  /// `session.next.tool.*` payloads), which carry a typed status plus an
  /// input object and text content instead of the legacy state blob.
  init(v2Status status: String, input: [String: Any]?, outputText: String?) {
    displayString = status
    title = nil
    let decodedInput = Self.decodeInput(input)
    inputSummary = decodedInput.summary
    pathFromInput = decodedInput.path
    output = outputText
    todos = decodedInput.todos ?? Self.decodeTodos(fromJSONText: outputText)
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let string = try? container.decode(String.self) {
      displayString = string
      title = nil
      inputSummary = nil
      output = nil
      pathFromInput = nil
      todos = nil
      return
    }
    guard let dictionary = try? container.decode([String: AnyCodable].self) else {
      throw DecodingError.typeMismatch(
        PartStateBridge.self,
        DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Part.state must be String or object")
      )
    }

    let decoded = Self.decodeObject(dictionary)
    displayString = decoded.displayString
    title = decoded.title
    inputSummary = decoded.inputSummary
    output = decoded.output
    pathFromInput = decoded.path
    todos = decoded.todos
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(displayString)
  }
}

nonisolated struct Part: Codable, Identifiable {
  let id: String
  let messageID: String
  let sessionID: String
  let type: String
  let text: String?
  let tool: String?
  let callID: String?
  let state: PartStateBridge?
  let metadata: PartMetadata?
  let files: [FileChange]?
  var mime: String?
  var filename: String?
  var url: String?
  var source: String?

  /// For UI display; handles both string and object state
  var stateDisplay: String? { state?.displayString }
  /// Call reason/description (used for the tool label)
  var toolReason: String? { state?.title }
  /// Command/input summary
  var toolInputSummary: String? { state?.inputSummary }
  var toolInputSummaryForDisplay: String? {
    toolInputSummary.map(DisplayTextDecoder.decodeJSONUnicodeEscapes)
  }
  /// Output result
  var toolOutput: String? { state?.output }
  var toolOutputForDisplay: String? {
    toolOutput.map(DisplayTextDecoder.decodeJSONUnicodeEscapes)
  }

  var toolTodos: [TodoItem] {
    if let t = metadata?.todos, !t.isEmpty { return t }
    if let t = state?.todos, !t.isEmpty { return t }
    return []
  }

  struct FileChange: Codable {
    let path: String
    let additions: Int
    let deletions: Int
    let status: String?

    private enum CodingKeys: String, CodingKey {
      case path, additions, deletions, status
    }

    init(path: String, additions: Int = 0, deletions: Int = 0, status: String? = nil) {
      self.path = path
      self.additions = additions
      self.deletions = deletions
      self.status = status
    }

    init(from decoder: Decoder) throws {
      let single = try decoder.singleValueContainer()
      if let path = try? single.decode(String.self) {
        self.path = path
        additions = 0
        deletions = 0
        status = nil
        return
      }

      let c = try decoder.container(keyedBy: CodingKeys.self)
      path = try c.decode(String.self, forKey: .path)
      additions = (try? c.decode(Int.self, forKey: .additions)) ?? 0
      deletions = (try? c.decode(Int.self, forKey: .deletions)) ?? 0
      status = try? c.decode(String.self, forKey: .status)
    }
  }

  struct PartMetadata: Codable {
    let path: String?
    let title: String?
    let input: String?
    let todos: [TodoItem]?

    private enum CodingKeys: String, CodingKey {
      case path
      case title
      case input
      case todos
    }

    init(path: String?, title: String?, input: String?, todos: [TodoItem]?) {
      self.path = path
      self.title = title
      self.input = input
      self.todos = todos
    }

    init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)

      path = try? c.decode(String.self, forKey: .path)
      title = try? c.decode(String.self, forKey: .title)

      if let inputString = try? c.decode(String.self, forKey: .input) {
        input = inputString
      } else if let inputObject = try? c.decode([String: AnyCodable].self, forKey: .input),
        JSONSerialization.isValidJSONObject(inputObject.mapValues({ $0.value })),
        let data = try? JSONSerialization.data(withJSONObject: inputObject.mapValues({ $0.value })),
        let text = String(data: data, encoding: .utf8)
      {
        input = text
      } else {
        input = nil
      }

      if let decoded = try? c.decode([TodoItem].self, forKey: .todos) {
        todos = decoded
      } else if let raw = try? c.decode([AnyCodable].self, forKey: .todos),
        JSONSerialization.isValidJSONObject(raw.map({ $0.value })),
        let data = try? JSONSerialization.data(withJSONObject: raw.map({ $0.value })),
        let decoded = try? JSONDecoder().decode([TodoItem].self, from: data)
      {
        todos = decoded
      } else {
        todos = nil
      }
    }

    func encode(to encoder: Encoder) throws {
      var c = encoder.container(keyedBy: CodingKeys.self)
      try c.encodeIfPresent(path, forKey: .path)
      try c.encodeIfPresent(title, forKey: .title)
      try c.encodeIfPresent(input, forKey: .input)
      try c.encodeIfPresent(todos, forKey: .todos)
    }
  }

  var isText: Bool { type == "text" }
  var isReasoning: Bool { type == "reasoning" }
  var isTool: Bool { type == "tool" }
  var isPatch: Bool { type == "patch" }
  var isFile: Bool { type == "file" }
  var isImageAttachment: Bool { isFile && (mime?.hasPrefix("image/") ?? false) }

  /// List of navigable file paths: from the files array, metadata.path, or path/patchText parsing in state.input
  var filePathsForNavigation: [String] {
    var out: [String] = []
    if let files = files {
      out.append(contentsOf: files.map { PathNormalizer.normalize($0.path) })
    }
    if let p = metadata?.path.map({ PathNormalizer.normalize($0) }), !p.isEmpty {
      out.append(p)
    }
    if let p = state?.pathFromInput.map({ PathNormalizer.normalize($0) }), !p.isEmpty, !out.contains(p) {
      out.append(p)
    }
    return out
  }
  var isStepStart: Bool { type == "step-start" }
  var isStepFinish: Bool { type == "step-finish" }
}
