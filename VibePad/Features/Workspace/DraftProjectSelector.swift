import Observation
import SwiftUI

@MainActor
@Observable
private final class ProjectBrowserStore {
  var home = ""
  var directory = ""
  var directories: [FileNode] = []
  var isLoading = false
  var error: String?

  func loadHome(using apiClient: APIClientProtocol) async {
    guard directory.isEmpty else { return }
    do {
      let paths = try await apiClient.serverPaths()
      home = paths.home
      await navigate(to: paths.home, using: apiClient)
    } catch {
      self.error = error.localizedDescription
    }
  }

  func navigate(to path: String, using apiClient: APIClientProtocol) async {
    isLoading = true
    error = nil
    defer { isLoading = false }
    do {
      directories = try await apiClient.fileList(path: "", scope: OpenCodeScope(directory: path))
        .filter { $0.type == "directory" }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
      directory = path
    } catch {
      self.error = error.localizedDescription
    }
  }

  func childPath(_ node: FileNode) -> String {
    let name = node.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    return URL(fileURLWithPath: directory, isDirectory: true).appendingPathComponent(name, isDirectory: true).path
  }

  var parent: String? {
    guard !directory.isEmpty, directory != "/", directory != home else { return nil }
    return URL(fileURLWithPath: directory).deletingLastPathComponent().path
  }

  var displayPath: String {
    guard !home.isEmpty, directory.hasPrefix(home) else { return directory }
    let suffix = directory.dropFirst(home.count)
    return suffix.isEmpty ? "~/" : "~\(suffix)/"
  }
}

struct DraftProjectSelector: View {
  @Bindable var state: AppState
  @Bindable var workspace: WorkspaceStore
  let tab: WorkspaceTab

  @State private var showsBrowser = false
  @State private var browser = ProjectBrowserStore()

  var body: some View {
    HStack(spacing: 6) {
      SCDropdownMenu {
        SCDropdownMenuTrigger {
          Label(selectedName, systemImage: "folder")
        }
      } content: {
        SCDropdownMenuContent {
          ForEach(state.projects) { project in
            SCDropdownMenuItem {
              select(project.worktree)
            } label: {
              Label(project.displayName, systemImage: project.worktree == selectedDirectory ? "checkmark" : "folder")
            }
          }
          if !state.projects.isEmpty { SCDropdownMenuSeparator() }
          SCDropdownMenuItem {
            showsBrowser = true
          } label: {
            Label("Add project", systemImage: "folder.badge.plus")
          }
        }
      }
      .buttonStyle(.sc(.ghost, size: .sm))
      .accessibilityIdentifier("workspace-project-picker")

      Text(selectedDirectory.isEmpty ? "Choose a server folder" : selectedDirectory)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .truncationMode(.middle)

      Spacer()
    }
    .frame(maxWidth: .infinity)
    .background {
      SCDialog(isPresented: $showsBrowser) {
        EmptyView()
      } content: {
        SCDialogContent(size: .large, maxHeight: 600) {
          SCDialogHeader {
            SCDialogTitle("Add project")
            SCDialogDescription("Choose a folder on the connected OpenCode server.")
          }

          HStack(spacing: 8) {
            Button {
              guard let parent = browser.parent else { return }
              Task { await browser.navigate(to: parent, using: state.apiClient) }
            } label: {
              Image(systemName: "chevron.left")
            }
            .buttonStyle(.sc(.outline, size: .iconSM))
            .disabled(browser.parent == nil)

            Text(browser.displayPath)
              .font(.callout.monospaced())
              .lineLimit(1)
              .truncationMode(.middle)

            Spacer()

            Button("Select this folder") {
              select(browser.directory)
              showsBrowser = false
            }
            .buttonStyle(.sc())
            .disabled(browser.directory.isEmpty)
          }

          SCSeparator()

          SCDialogScrollContent(maxHeight: 390) {
            LazyVStack(spacing: 2) {
              if browser.isLoading {
                ProgressView().padding(32)
              } else if let error = browser.error {
                ContentUnavailableView(
                  "Could not load folder", systemImage: "exclamationmark.triangle", description: Text(error))
              } else {
                ForEach(browser.directories) { node in
                  Button {
                    Task { await browser.navigate(to: browser.childPath(node), using: state.apiClient) }
                  } label: {
                    Label(node.name, systemImage: "folder")
                      .frame(maxWidth: .infinity, alignment: .leading)
                  }
                  .buttonStyle(.sc(.ghost))
                }
              }
            }
          }
        }
      }
    }
    .task(id: showsBrowser) {
      guard showsBrowser else { return }
      await browser.loadHome(using: state.apiClient)
    }
  }

  private var selectedDirectory: String {
    state.effectiveProjectDirectory ?? tab.directory
  }

  private var selectedName: String {
    guard !selectedDirectory.isEmpty else { return "Select project" }
    return URL(fileURLWithPath: selectedDirectory).lastPathComponent
  }

  private func select(_ directory: String) {
    state.selectedProjectWorktree = AppState.customProjectSentinel
    state.customProjectPath = directory
    workspace.setDirectory(directory, for: tab.id)
  }
}
