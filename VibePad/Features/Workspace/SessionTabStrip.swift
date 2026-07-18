import SwiftUI

struct SessionTabStrip: View {
  @Bindable var workspace: WorkspaceStore
  let onSelect: (WorkspaceTab) -> Void
  let onNewTab: () -> Void
  let onRename: (WorkspaceTab, String) -> Void

  @State private var renameTab: WorkspaceTab?
  @State private var renameTitle = ""

  var body: some View {
    HStack(spacing: 6) {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 13) {
          ForEach(workspace.tabs) { tab in
            SessionTabItem(
              tab: tab,
              isSelected: workspace.selectedTabID == tab.id,
              onSelect: {
                workspace.select(tab.id)
                onSelect(tab)
              },
              onClose: { close(tab) },
              onRename: {
                renameTab = tab
                renameTitle = tab.title
              }
            )
          }
        }
      }

      Button(action: onNewTab) {
        Image(systemName: "plus")
      }
      .buttonStyle(.sc(.ghost, size: .iconSM))
      .accessibilityLabel("New session tab")
      .accessibilityIdentifier("workspace-new-tab")

    }
    .frame(minHeight: 42)
    .padding(.horizontal, 8)
    .alert("Rename session", isPresented: renamePresented) {
      TextField("Session name", text: $renameTitle)
      Button("Cancel", role: .cancel) {}
      Button("Rename") {
        guard let tab = renameTab else { return }
        let title = renameTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        workspace.rename(tab.id, title: title)
        onRename(tab, title)
      }
    }
  }

  private var renamePresented: Binding<Bool> {
    Binding(
      get: { renameTab != nil },
      set: { if !$0 { renameTab = nil } }
    )
  }

  private func close(_ tab: WorkspaceTab) {
    workspace.close(tab.id)
    if let selected = workspace.selectedTab { onSelect(selected) }
  }
}

private struct SessionTabItem: View {
  let tab: WorkspaceTab
  let isSelected: Bool
  let onSelect: () -> Void
  let onClose: () -> Void
  let onRename: () -> Void

  @Environment(\.theme) private var theme
  @State private var isHovered = false

  var body: some View {
    HStack(spacing: 3) {
      Button(action: onSelect) {
        HStack(spacing: 7) {
          Image(systemName: tab.kind == .draft ? "square.and.pencil" : "bubble.left")
          Text(tab.title)
            .lineLimit(1)
        }
        .frame(maxWidth: 180, alignment: .leading)
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("workspace-tab-\(tab.id.uuidString)")

      if isSelected || isHovered {
        Button(action: onClose) {
          Image(systemName: "xmark")
            .font(.caption2.weight(.semibold))
            .frame(width: 20, height: 20)
        }
        .buttonStyle(.sc(.ghost, size: .iconSM))
        .accessibilityLabel("Close \(tab.title)")
        .accessibilityIdentifier("workspace-close-tab-\(tab.id.uuidString)")
      }
    }
    .foregroundStyle(isSelected ? theme.foreground : theme.mutedForeground)
    .padding(.leading, 9)
    .padding(.trailing, isSelected || isHovered ? 4 : 9)
    .frame(height: 30)
    .background(isSelected || isHovered ? theme.accent : theme.background)
    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .strokeBorder(isSelected ? theme.border : .clear)
    }
    .onHover { isHovered = $0 }
    .scContextMenu {
      SCContextMenuItem(action: onRename) {
        Label("Rename", systemImage: "pencil")
      }
      SCContextMenuSeparator()
      SCContextMenuItem(variant: .destructive, action: onClose) {
        Label("Close", systemImage: "xmark")
      }
    }
  }
}
