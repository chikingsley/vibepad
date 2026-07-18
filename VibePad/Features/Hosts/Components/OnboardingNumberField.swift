import SwiftUI

struct OnboardingNumberField: View {
  let label: String
  let placeholder: String
  @Binding var value: Int

  var body: some View {
    SCField {
      SCFieldLabel(label)
      SCInput(placeholder, value: $value, kind: .number)
    }
  }
}
