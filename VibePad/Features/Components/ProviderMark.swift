import SwiftUI

struct ProviderMark: View {
  let providerID: String
  var size: CGFloat = 16

  var body: some View {
    Group {
      if ProviderIconCatalog.providerIDs.contains(providerID) {
        Image("Provider-\(providerID)")
          .resizable()
          .renderingMode(.template)
      } else {
        Text(initials)
          .font(.system(size: max(7, size * 0.46), weight: .bold, design: .rounded))
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  private var initials: String {
    let words = providerID.split(whereSeparator: { $0 == "-" || $0 == "_" })
    return words.prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
  }
}
