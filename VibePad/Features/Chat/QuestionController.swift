//
//  QuestionController.swift
//  VibePad
//

import Foundation

nonisolated enum QuestionController {
  static func fromPendingRequests(_ requests: [QuestionRequest]) -> [QuestionRequest] {
    requests
  }

  static func parseAskedEvent(properties: [String: AnyCodable]) -> QuestionRequest? {
    let raw = properties.mapValues { $0.value }
    guard JSONSerialization.isValidJSONObject(raw),
      let data = try? JSONSerialization.data(withJSONObject: raw),
      let request = try? JSONDecoder().decode(QuestionRequest.self, from: data)
    else {
      return nil
    }
    return request
  }

  static func applyResolvedEvent(properties: [String: AnyCodable], to questions: inout [QuestionRequest]) {
    let requestID = (properties["requestID"]?.value as? String) ?? (properties["id"]?.value as? String)
    guard let requestID else { return }
    questions.removeAll { $0.id == requestID }
  }
}
