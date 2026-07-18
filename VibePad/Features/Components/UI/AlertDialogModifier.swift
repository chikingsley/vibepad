import SwiftUI

extension View {
  /// Convenience composition for a string-based confirmation dialog.
  public func scAlertDialog(
    isPresented: Binding<Bool>,
    title: String,
    message: String,
    confirmLabel: String = "Continue",
    cancelLabel: String = "Cancel",
    role: SCAlertDialogRole = .default,
    onConfirm: @escaping () -> Void
  ) -> some View {
    modifier(
      SCAlertDialogModifier(
        isPresented: isPresented,
        title: title,
        message: message,
        confirmLabel: confirmLabel,
        cancelLabel: cancelLabel,
        role: role,
        onConfirm: onConfirm
      ))
  }
}

private struct SCAlertDialogModifier: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @Binding var isPresented: Bool
  var title: String
  var message: String
  var confirmLabel: String
  var cancelLabel: String
  var role: SCAlertDialogRole
  var onConfirm: () -> Void

  func body(content: Content) -> some View {
    content.overlay {
      if isPresented {
        ZStack {
          SCAlertDialogOverlay()
          SCAlertDialogContent {
            SCAlertDialogHeader {
              SCAlertDialogTitle(title)
              SCAlertDialogDescription(message)
            }
            SCAlertDialogFooter {
              SCAlertDialogCancel(cancelLabel)
              SCAlertDialogAction(
                confirmLabel,
                role: role,
                action: onConfirm
              )
            }
          }
          .accessibilityAddTraits(.isModal)
          .transition(.scale(scale: 0.95).combined(with: .opacity))
        }
        .environment(
          \.scAlertDialogPresentation,
          SCAlertDialogPresentation(isPresented: $isPresented)
        )
      }
    }
    .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: isPresented)
  }
}
