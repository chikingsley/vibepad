import Foundation
import Observation

nonisolated struct WorkspaceTab: Codable, Hashable, Identifiable, Sendable {
  enum Kind: String, Codable, Sendable {
    case session
    case draft
  }

  let id: UUID
  var kind: Kind
  var serverKey: String
  var directory: String
  var sessionID: String?
  var title: String

  static func session(_ session: Session, serverKey: String) -> WorkspaceTab {
    WorkspaceTab(
      id: UUID(),
      kind: .session,
      serverKey: serverKey,
      directory: session.directory,
      sessionID: session.id,
      title: session.title
    )
  }

  static func draft(serverKey: String, directory: String) -> WorkspaceTab {
    WorkspaceTab(
      id: UUID(),
      kind: .draft,
      serverKey: serverKey,
      directory: directory,
      sessionID: nil,
      title: "New session"
    )
  }
}

@MainActor
@Observable
final class WorkspaceStore {
  private struct Snapshot: Codable {
    var tabs: [WorkspaceTab]
    var selectedTabID: UUID?
  }

  private static let persistenceKey = "workspace.tabs.v1"
  private let snapshotRepository: WorkspaceSnapshotRepository

  private(set) var tabs: [WorkspaceTab]
  var selectedTabID: UUID? {
    didSet { persist() }
  }

  init(defaults: UserDefaults? = .standard) {
    snapshotRepository = WorkspaceSnapshotRepository(defaults: defaults)
    if let snapshot = snapshotRepository.load(Snapshot.self, key: Self.persistenceKey) {
      tabs = snapshot.tabs
      selectedTabID = snapshot.selectedTabID
    } else {
      tabs = []
      selectedTabID = nil
    }
    reconcileSelection()
  }

  var selectedTab: WorkspaceTab? {
    guard let selectedTabID else { return nil }
    return tabs.first { $0.id == selectedTabID }
  }

  @discardableResult
  func openSession(_ session: Session, serverKey: String) -> WorkspaceTab {
    if let index = tabs.firstIndex(where: {
      $0.kind == .session && $0.serverKey == serverKey && $0.sessionID == session.id
    }) {
      tabs[index].title = session.title
      tabs[index].directory = session.directory
      selectedTabID = tabs[index].id
      persist()
      return tabs[index]
    }

    let tab = WorkspaceTab.session(session, serverKey: serverKey)
    tabs.append(tab)
    selectedTabID = tab.id
    persist()
    return tab
  }

  @discardableResult
  func newDraft(serverKey: String, directory: String) -> WorkspaceTab {
    let tab = WorkspaceTab.draft(serverKey: serverKey, directory: directory)
    tabs.append(tab)
    selectedTabID = tab.id
    persist()
    return tab
  }

  func select(_ id: UUID) {
    guard tabs.contains(where: { $0.id == id }) else { return }
    selectedTabID = id
  }

  func promoteDraft(_ tabID: UUID, to session: Session) {
    guard let index = tabs.firstIndex(where: { $0.id == tabID }) else { return }
    tabs[index].kind = .session
    tabs[index].sessionID = session.id
    tabs[index].directory = session.directory
    tabs[index].title = session.title
    selectedTabID = tabID
    persist()
  }

  func close(_ id: UUID) {
    guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
    let wasSelected = selectedTabID == id
    tabs.remove(at: index)
    if wasSelected {
      if tabs.indices.contains(index) {
        selectedTabID = tabs[index].id
      } else {
        selectedTabID = tabs.last?.id
      }
    }
    persist()
  }

  func rename(_ id: UUID, title: String) {
    guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
    tabs[index].title = title
    persist()
  }

  func setDirectory(_ directory: String, for id: UUID) {
    guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
    tabs[index].directory = directory
    persist()
  }

  func reconcileSessions(_ sessions: [Session], serverKey: String) {
    let sessionsByID = Dictionary(uniqueKeysWithValues: sessions.map { ($0.id, $0) })
    var changed = false
    for index in tabs.indices where tabs[index].serverKey == serverKey {
      guard let sessionID = tabs[index].sessionID, let session = sessionsByID[sessionID] else { continue }
      if tabs[index].title != session.title || tabs[index].directory != session.directory {
        tabs[index].title = session.title
        tabs[index].directory = session.directory
        changed = true
      }
    }
    if changed { persist() }
  }

  private func reconcileSelection() {
    guard selectedTabID.flatMap({ id in tabs.first(where: { $0.id == id }) }) == nil else { return }
    selectedTabID = tabs.first?.id
  }

  private func persist() {
    let snapshot = Snapshot(tabs: tabs, selectedTabID: selectedTabID)
    snapshotRepository.save(snapshot, key: Self.persistenceKey)
  }
}
