//
//  TodoListInlineView.swift
//  VibePad
//

import SwiftUI

struct TodoListInlineView: View {
  let todos: [TodoItem]

  var body: some View {
    VStack(alignment: .leading, spacing: DesignSpacing.sm) {
      ForEach(todos) { todo in
        HStack(alignment: .top, spacing: DesignSpacing.sm) {
          Image(systemName: todo.isCompleted ? "checkmark.circle.fill" : "circle")
            .foregroundStyle(todo.isCompleted ? DesignColors.Semantic.success : DesignColors.Neutral.textSecondary)
            .font(DesignTypography.micro)
            .padding(.top, 1)
          Text(todo.content)
            .font(DesignTypography.micro)
            .foregroundStyle(todo.isCompleted ? DesignColors.Neutral.textSecondary : DesignColors.Neutral.text)
            .strikethrough(todo.isCompleted)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
    .padding(.top, DesignSpacing.xs)
  }
}
