//
//  ModelPreset.swift
//  VibePad
//

import Foundation

nonisolated struct ModelPreset: Codable, Identifiable, Sendable {
  var id: String { "\(providerID)/\(modelID)" }
  let displayName: String
  let providerID: String
  let modelID: String
  var acceptsImages = false
  var acceptsPDF = false

  private enum CodingKeys: String, CodingKey {
    case displayName
    case providerID
    case modelID
    case acceptsImages
    case acceptsPDF
  }

  init(
    displayName: String,
    providerID: String,
    modelID: String,
    acceptsImages: Bool = false,
    acceptsPDF: Bool = false
  ) {
    self.displayName = displayName
    self.providerID = providerID
    self.modelID = modelID
    self.acceptsImages = acceptsImages
    self.acceptsPDF = acceptsPDF
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    displayName = try container.decode(String.self, forKey: .displayName)
    providerID = try container.decode(String.self, forKey: .providerID)
    modelID = try container.decode(String.self, forKey: .modelID)
    acceptsImages = try container.decodeIfPresent(Bool.self, forKey: .acceptsImages) ?? false
    acceptsPDF = try container.decodeIfPresent(Bool.self, forKey: .acceptsPDF) ?? false
  }

  var shortName: String {
    switch displayName {
    case "DeepSeek V4 Flash": return "DS-Flash"
    case "DeepSeek Local": return "DS-L"
    case "DeepSeek V4 Pro": return "DS-Pro"
    case "Ollama GLM 5.2": return "OGLM-5.2"
    case let name where name.contains("Gemini"): return "Gemini"
    case let name where name.contains("GPT"): return "GPT"
    default: return displayName
    }
  }
}

nonisolated struct ProviderSummary: Identifiable, Hashable, Sendable {
  let id: String
  let name: String
}
