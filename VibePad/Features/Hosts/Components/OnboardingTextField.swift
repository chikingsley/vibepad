import SwiftUI

struct OnboardingTextField: View {
  let label: String
  let placeholder: String
  @Binding var text: String
  var icon: String?
  var isSecure = false
  var accessibilityIdentifier: String?

  var body: some View {
    SCField {
      SCFieldLabel(label)
      SCInput(placeholder, text: $text, icon: icon, secure: isSecure)
        .accessibilityIdentifier(accessibilityIdentifier ?? "")
    }
  }
}
