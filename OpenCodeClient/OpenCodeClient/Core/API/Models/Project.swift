//
//  Project.swift
//  OpenCodeClient
//

import Foundation

nonisolated struct Project: Codable, Identifiable {
  let id: String
  let worktree: String
  let vcs: String?
  let icon: IconInfo?
  let time: TimeInfo?
  let sandboxes: [String]?

  private enum CodingKeys: String, CodingKey {
    case id, worktree, vcs, icon, time, sandboxes
  }

  struct IconInfo: Codable {
    let color: String?
  }

  struct TimeInfo: Codable {
    let created: Int?
    let updated: Int?
  }

  /// Display name for UI: last path component of worktree (e.g. "knowledge_working")
  var displayName: String {
    (worktree as NSString).lastPathComponent
  }

  init(
    id: String,
    worktree: String,
    vcs: String?,
    icon: IconInfo?,
    time: TimeInfo?,
    sandboxes: [String]?
  ) {
    self.id = id
    self.worktree = worktree
    self.vcs = vcs
    self.icon = icon
    self.time = time
    self.sandboxes = sandboxes
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    worktree = try c.decode(String.self, forKey: .worktree)
    vcs =
      (try? c.decode(String.self, forKey: .vcs))
      ?? (try? c.decode(ProjectVCS.self, forKey: .vcs))?.type
    icon = try? c.decode(IconInfo.self, forKey: .icon)
    time = try? c.decode(TimeInfo.self, forKey: .time)
    if let values = try? c.decode([String].self, forKey: .sandboxes) {
      sandboxes = values
    } else if let objects = try? c.decode([ProjectSandbox].self, forKey: .sandboxes) {
      sandboxes = objects.compactMap(\.id)
    } else {
      sandboxes = nil
    }
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(id, forKey: .id)
    try c.encode(worktree, forKey: .worktree)
    try c.encodeIfPresent(vcs, forKey: .vcs)
    try c.encodeIfPresent(icon, forKey: .icon)
    try c.encodeIfPresent(time, forKey: .time)
    try c.encodeIfPresent(sandboxes, forKey: .sandboxes)
  }

  private struct ProjectVCS: Codable {
    let type: String?
  }

  private struct ProjectSandbox: Codable {
    let id: String?
  }
}
