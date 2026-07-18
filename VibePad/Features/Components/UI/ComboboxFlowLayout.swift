import SwiftUI

struct SCComboboxFlowLayout: Layout {
  let spacing: CGFloat

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) -> CGSize {
    arrangement(proposal: proposal, subviews: subviews).size
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) {
    let result = arrangement(
      proposal: ProposedViewSize(width: bounds.width, height: proposal.height),
      subviews: subviews
    )
    for (index, frame) in result.frames.enumerated() {
      subviews[index].place(
        at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
        proposal: ProposedViewSize(frame.size)
      )
    }
  }

  private func arrangement(
    proposal: ProposedViewSize,
    subviews: Subviews
  ) -> (frames: [CGRect], size: CGSize) {
    let maximumWidth = proposal.width ?? .infinity
    var frames: [CGRect] = []
    var x: CGFloat = 0
    var y: CGFloat = 0
    var lineHeight: CGFloat = 0
    var usedWidth: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > maximumWidth {
        x = 0
        y += lineHeight + spacing
        lineHeight = 0
      }
      frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
      x += size.width + spacing
      lineHeight = max(lineHeight, size.height)
      usedWidth = max(usedWidth, x - spacing)
    }

    return (frames, CGSize(width: usedWidth, height: y + lineHeight))
  }
}
