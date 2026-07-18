import SwiftUI

#if os(macOS)
  import AppKit
#endif

public enum SCOverlayAlignment: Hashable, Sendable {
  case start
  case center
  case end
}

public enum SCOverlaySide: Hashable, Sendable {
  case top
  case bottom
  case leading
  case trailing
}

/// Presents content outside the caller's SwiftUI layout hierarchy.
///
/// On macOS this is the native counterpart to shadcn/Base UI's portal and
/// positioner: an arrowless panel anchored to the trigger's screen frame. The
/// panel cannot be clipped by a card, scroll view, split view, or window-root
/// overlay. Other platforms retain SwiftUI's native popover presentation.
public struct SCOverlayPortal<OverlayContent: View>: View {
  @Binding private var isPresented: Bool
  private let width: CGFloat
  private let maxHeight: CGFloat
  private let gap: CGFloat
  private let side: SCOverlaySide
  private let alignment: SCOverlayAlignment
  private let acceptsKey: Bool
  private let content: OverlayContent

  public init(
    isPresented: Binding<Bool>,
    width: CGFloat,
    maxHeight: CGFloat = 360,
    gap: CGFloat = 6,
    side: SCOverlaySide = .bottom,
    alignment: SCOverlayAlignment = .end,
    acceptsKey: Bool = true,
    @ViewBuilder content: () -> OverlayContent
  ) {
    _isPresented = isPresented
    self.width = width
    self.maxHeight = maxHeight
    self.gap = gap
    self.side = side
    self.alignment = alignment
    self.acceptsKey = acceptsKey
    self.content = content()
  }

  public var body: some View {
    #if os(macOS)
      SCMacOverlayPortal(
        isPresented: $isPresented,
        width: width,
        maxHeight: maxHeight,
        gap: gap,
        side: side,
        alignment: alignment,
        acceptsKey: acceptsKey,
        content: content
      )
    #else
      Color.clear
        .frame(width: 0, height: 0)
        .popover(isPresented: $isPresented, arrowEdge: .top) {
          content
            .frame(width: width)
            .frame(maxHeight: maxHeight)
            .presentationCompactAdaptation(.popover)
        }
    #endif
  }
}

#if os(macOS)
  private struct SCMacOverlayPortal<OverlayContent: View>: NSViewRepresentable {
    @Binding var isPresented: Bool
    let width: CGFloat
    let maxHeight: CGFloat
    let gap: CGFloat
    let side: SCOverlaySide
    let alignment: SCOverlayAlignment
    let acceptsKey: Bool
    let content: OverlayContent

    func makeCoordinator() -> Coordinator {
      Coordinator(isPresented: $isPresented)
    }

    func makeNSView(context: Context) -> NSView {
      NSView()
    }

    func updateNSView(_ anchor: NSView, context: Context) {
      context.coordinator.update(
        anchor: anchor,
        isPresented: $isPresented,
        presentation: Presentation(
          width: width,
          maxHeight: maxHeight,
          gap: gap,
          side: side,
          alignment: alignment,
          acceptsKey: acceptsKey,
          content: AnyView(content)
        )
      )
    }

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
      coordinator.dismiss(updatingBinding: false)
    }

    struct Presentation {
      let width: CGFloat
      let maxHeight: CGFloat
      let gap: CGFloat
      let side: SCOverlaySide
      let alignment: SCOverlayAlignment
      let acceptsKey: Bool
      let content: AnyView
    }

    @MainActor
    final class Coordinator: NSObject {
      private weak var anchor: NSView?
      private weak var parentWindow: NSWindow?
      private var isPresented: Binding<Bool>
      private var panel: SCOverlayPanel?
      private var hostingView: NSHostingView<AnyView>?
      private var localMouseMonitor: Any?
      private var globalMouseMonitor: Any?
      private var keyMonitor: Any?
      private var observers: [NSObjectProtocol] = []
      private var width: CGFloat = 0
      private var maxHeight: CGFloat = 0
      private var gap: CGFloat = 0
      private var side = SCOverlaySide.bottom
      private var alignment = SCOverlayAlignment.end
      private var acceptsKey = true

      init(isPresented: Binding<Bool>) {
        self.isPresented = isPresented
      }

      func update(
        anchor: NSView,
        isPresented: Binding<Bool>,
        presentation: Presentation
      ) {
        self.anchor = anchor
        self.isPresented = isPresented
        width = presentation.width
        maxHeight = presentation.maxHeight
        gap = presentation.gap
        side = presentation.side
        alignment = presentation.alignment
        acceptsKey = presentation.acceptsKey

        guard isPresented.wrappedValue else {
          dismiss(updatingBinding: false)
          return
        }

        let framedContent = AnyView(
          presentation.content
            .frame(width: presentation.width)
            .fixedSize(horizontal: false, vertical: true)
        )
        if let hostingView {
          hostingView.rootView = framedContent
        } else {
          let hostingView = NSHostingView(rootView: framedContent)
          hostingView.wantsLayer = true
          hostingView.layer?.backgroundColor = NSColor.clear.cgColor
          self.hostingView = hostingView
        }

        DispatchQueue.main.async { [weak self, weak anchor] in
          guard let self, let anchor, self.isPresented.wrappedValue else { return }
          self.present(from: anchor)
        }
      }

      func dismiss(updatingBinding: Bool) {
        removeMonitors()
        if let panel, let parentWindow, panel.parent === parentWindow {
          parentWindow.removeChildWindow(panel)
        }
        panel?.orderOut(nil)
        panel = nil
        hostingView = nil
        self.parentWindow = nil
        if updatingBinding, isPresented.wrappedValue {
          isPresented.wrappedValue = false
        }
      }

      private func present(from anchor: NSView) {
        guard let parentWindow = anchor.window, let hostingView else { return }
        self.parentWindow = parentWindow

        let panel = panel ?? makePanel(contentView: hostingView)
        self.panel = panel
        let fittingSize = hostingView.fittingSize
        let height = min(max(fittingSize.height, 1), maxHeight)
        hostingView.frame = CGRect(x: 0, y: 0, width: width, height: height)
        panel.setContentSize(CGSize(width: width, height: height))
        panel.setFrameOrigin(origin(for: panel.frame.size, anchor: anchor, window: parentWindow))

        if panel.parent !== parentWindow {
          parentWindow.addChildWindow(panel, ordered: .above)
        }
        if acceptsKey {
          panel.makeKeyAndOrderFront(nil)
        } else {
          panel.orderFront(nil)
        }
        installMonitors()
      }

      private func makePanel(contentView: NSView) -> SCOverlayPanel {
        let panel = SCOverlayPanel(
          contentRect: .zero,
          styleMask: [.borderless, .nonactivatingPanel],
          backing: .buffered,
          defer: true
        )
        panel.contentView = contentView
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = true
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .utilityWindow
        panel.collectionBehavior = [.transient, .fullScreenAuxiliary]
        return panel
      }

      private func origin(for panelSize: CGSize, anchor: NSView, window: NSWindow) -> CGPoint {
        let anchorInWindow = anchor.convert(anchor.bounds, to: nil)
        let anchorOnScreen = window.convertToScreen(anchorInWindow)
        let visibleFrame = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? .zero

        let desiredX: CGFloat
        let desiredY: CGFloat
        switch side {
        case .top, .bottom:
          desiredX =
            switch alignment {
            case .start: anchorOnScreen.minX
            case .center: anchorOnScreen.midX - panelSize.width / 2
            case .end: anchorOnScreen.maxX - panelSize.width
            }
          let belowY = anchorOnScreen.minY - gap - panelSize.height
          let aboveY = anchorOnScreen.maxY + gap
          if side == .bottom {
            desiredY = belowY >= visibleFrame.minY ? belowY : aboveY
          } else {
            desiredY = aboveY + panelSize.height <= visibleFrame.maxY ? aboveY : belowY
          }
        case .leading, .trailing:
          let leadingX = anchorOnScreen.minX - gap - panelSize.width
          let trailingX = anchorOnScreen.maxX + gap
          if side == .leading {
            desiredX = leadingX >= visibleFrame.minX ? leadingX : trailingX
          } else {
            desiredX = trailingX + panelSize.width <= visibleFrame.maxX ? trailingX : leadingX
          }
          desiredY =
            switch alignment {
            case .start: anchorOnScreen.maxY - panelSize.height
            case .center: anchorOnScreen.midY - panelSize.height / 2
            case .end: anchorOnScreen.minY
            }
        }
        let maximumX = visibleFrame.maxX - panelSize.width
        let x = min(max(desiredX, visibleFrame.minX), max(visibleFrame.minX, maximumX))
        let maximumY = visibleFrame.maxY - panelSize.height
        let y = min(max(desiredY, visibleFrame.minY), max(visibleFrame.minY, maximumY))
        return CGPoint(x: x, y: y)
      }

      private func installMonitors() {
        guard localMouseMonitor == nil else { return }
        let mouseMask: NSEvent.EventTypeMask = [.leftMouseDown, .rightMouseDown, .otherMouseDown]
        localMouseMonitor = NSEvent.addLocalMonitorForEvents(matching: mouseMask) {
          [weak self] event in
          guard let self, self.isPresented.wrappedValue else { return event }
          if self.containsCurrentPointer { return event }
          self.dismiss(updatingBinding: true)
          return event
        }
        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: mouseMask) {
          [weak self] _ in
          self?.dismiss(updatingBinding: true)
        }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
          guard event.keyCode == 53 else { return event }
          self?.dismiss(updatingBinding: true)
          return nil
        }
        observers.append(
          NotificationCenter.default.addObserver(
            forName: NSApplication.didResignActiveNotification,
            object: nil,
            queue: .main
          ) { [weak self] _ in
            MainActor.assumeIsolated {
              self?.dismiss(updatingBinding: true)
            }
          }
        )
        for name in [NSWindow.didMoveNotification, NSWindow.didResizeNotification] {
          observers.append(
            NotificationCenter.default.addObserver(
              forName: name,
              object: parentWindow,
              queue: .main
            ) { [weak self] _ in
              MainActor.assumeIsolated {
                guard let self, let anchor = self.anchor else { return }
                self.present(from: anchor)
              }
            }
          )
        }
      }

      private var containsCurrentPointer: Bool {
        let location = NSEvent.mouseLocation
        if let panel, panel.frame.contains(location) { return true }
        guard let anchor, let window = anchor.window else { return false }
        return window.convertToScreen(anchor.convert(anchor.bounds, to: nil)).contains(location)
      }

      private func removeMonitors() {
        if let localMouseMonitor { NSEvent.removeMonitor(localMouseMonitor) }
        if let globalMouseMonitor { NSEvent.removeMonitor(globalMouseMonitor) }
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        localMouseMonitor = nil
        globalMouseMonitor = nil
        keyMonitor = nil
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers.removeAll()
      }
    }
  }

  private final class SCOverlayPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
  }
#endif
