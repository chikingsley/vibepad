import Foundation

/// File tree browsing + status + search + content loading. State
/// (`fileTreeRoot`, `fileStatusMap`, `fileChildrenCache`, `expandedPaths`,
/// `fileSearchResults`) lives on the `FileStore` and is exposed through
/// computed accessors on `AppState`. This extension hosts the user-facing
/// load actions.
extension AppState {
  func loadFileTree() async {
    let previousChildrenCache = fileChildrenCache
    let previouslyExpandedPaths = expandedPaths
    do {
      fileTreeRoot = try await apiClient.fileList(path: "", scope: activeOpenCodeScope)
      fileChildrenCache = previousChildrenCache.filter { previouslyExpandedPaths.contains($0.key) }
    } catch {
      fileTreeRoot = []
    }
  }

  func loadFileStatus() async {
    do {
      let entries = try await apiClient.fileStatus(scope: activeOpenCodeScope)
      var nextStatusMap: [String: String] = [:]
      for entry in entries {
        guard let path = entry.path else { continue }
        nextStatusMap[path] = entry.status ?? ""
      }
      fileStatusMap = nextStatusMap
    } catch {
      fileStatusMap = [:]
    }
  }

  func loadFileChildren(path: String) async -> [FileNode] {
    do {
      let children = try await apiClient.fileList(path: path, scope: activeOpenCodeScope)
      fileChildrenCache[path] = children
      return children
    } catch {
      fileChildrenCache[path] = []
      return []
    }
  }

  func cachedChildren(for path: String) -> [FileNode]? {
    fileChildrenCache[path]
  }

  func searchFiles(query: String) async {
    guard !query.isEmpty else {
      fileSearchResults = []
      return
    }
    do {
      fileSearchResults = try await apiClient.findFile(query: query, limit: 50, scope: activeOpenCodeScope)
    } catch {
      fileSearchResults = []
    }
  }

  func loadFileContent(path: String) async throws -> FileContent {
    let resolved = PathNormalizer.resolveWorkspaceRelativePath(path, workspaceDirectory: currentSession?.directory)
    if resolved.hasPrefix("/") {
      let url = URL(fileURLWithPath: resolved)
      return try await apiClient.fileContent(
        path: url.lastPathComponent,
        scope: OpenCodeScope(directory: url.deletingLastPathComponent().path)
      )
    }
    return try await apiClient.fileContent(path: resolved, scope: activeOpenCodeScope)
  }

  func loadFileContent(pathBytes: [UInt8]) async throws -> FileContent {
    guard let path = String(bytes: pathBytes, encoding: .utf8) else {
      throw CocoaError(.fileReadInapplicableStringEncoding)
    }
    return try await loadFileContent(path: path)
  }

  func toggleFileExpanded(_ path: String) {
    if expandedPaths.contains(path) {
      expandedPaths.remove(path)
    } else {
      expandedPaths.insert(path)
    }
  }

  func isFileExpanded(_ path: String) -> Bool {
    expandedPaths.contains(path)
  }
}
