//
//  StreamingReasoningView.swift
//  OpenCodeClient
//

import SwiftUI

/// Shown only while streaming; disappears once thinking completes. No sync bar; gray typewriter-effect text.
struct StreamingReasoningView: View {
  let part: Part
  @Bindable var state: AppState

  private var displayText: String {
    let key = "\(part.messageID):\(part.id)"
    return state.streamingPartTexts[key] ?? part.text ?? ""
  }

  var body: some View {
    if !displayText.isEmpty {
      Text(displayText)
        .font(DesignTypography.micro)
        .foregroundStyle(DesignColors.Neutral.textSecondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}
