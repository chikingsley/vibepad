import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

#if canImport(UIKit)
  import UIKit
#endif

struct SessionComposer: View {
  @Bindable var state: AppState
  @Binding var text: String
  let onSubmit: (String, [ComposerImageAttachment]) async -> Bool

  @State private var isSending = false
  @State private var showsPhotoPicker = false
  @State private var showsFilePicker = false
  @State private var selectedPhotoItems: [PhotosPickerItem] = []
  @State private var attachments: [ComposerImageAttachment] = []
  @State private var isLoadingAttachment = false
  @State private var attachmentError: String?
  @State private var speech = AppleSpeechSession()
  @State private var recordingPrefix = ""
  @State private var speechError: String?

  private var canSend: Bool {
    !isSending && !speech.isConnected
      && (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty)
  }

  var body: some View {
    VStack(spacing: 6) {
      if let speechError {
        statusRow(speechError, systemImage: "waveform.badge.exclamationmark")
      }

      SCInputGroup(isInvalid: attachmentError != nil) {
        if !attachments.isEmpty || isLoadingAttachment || attachmentError != nil {
          SCInputGroupAddon(alignment: .blockStart) {
            attachmentRow
          }
        }

        SCInputGroupTextarea(
          L10n.t(.chatInputPlaceholder),
          text: $text,
          minHeight: DesignControls.composerTextMinHeight
        )

        SCInputGroupAddon(alignment: .blockEnd) {
          composerActions
        }
      }
      .frame(height: attachments.isEmpty && attachmentError == nil ? 128 : 180)
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("chat-composer")
    }
    .photosPicker(
      isPresented: $showsPhotoPicker,
      selection: $selectedPhotoItems,
      maxSelectionCount: 4,
      matching: .images
    )
    .onChange(of: selectedPhotoItems) { _, items in
      Task { await loadSelectedPhotos(items) }
    }
    .fileImporter(
      isPresented: $showsFilePicker,
      allowedContentTypes: [.image, .pdf],
      allowsMultipleSelection: true
    ) { result in
      loadSelectedFiles(result)
    }
  }

  private var composerActions: some View {
    HStack(spacing: 6) {
      SCDropdownMenu {
        SCDropdownMenuTrigger {
          Image(systemName: "plus")
            .frame(width: 28, height: 28)
        }
      } content: {
        SCDropdownMenuContent {
          SCDropdownMenuItem(isDisabled: isLoadingAttachment || isSending) {
            showsPhotoPicker = true
          } label: {
            Label("Add image", systemImage: "photo")
          }
          SCDropdownMenuItem(isDisabled: isLoadingAttachment || isSending) {
            showsFilePicker = true
          } label: {
            Label("Add file", systemImage: "doc")
              .accessibilityIdentifier("chat-add-file")
          }
          SCDropdownMenuItem(isDisabled: true) {
          } label: {
            Label("Add context — coming next", systemImage: "at")
          }
        }
      }
      .buttonStyle(.sc(.ghost, size: .iconSM))
      .accessibilityLabel("Add attachment or context")
      .accessibilityIdentifier("chat-add-context")

      agentPicker
      modelPicker

      Spacer(minLength: 8)

      SCSpeechInput(
        session: speech,
        onChange: { data in
          text = ChatTabView.mergedSpeechInput(prefix: recordingPrefix, transcript: data.transcript)
        },
        onStart: { _ in recordingPrefix = text },
        onStop: { _ in speech.clearTranscripts() },
        onCancel: { _ in text = recordingPrefix },
        onError: { error in speechError = error.localizedDescription },
        content: {
          SCSpeechInputCancelButton()
          SCSpeechInputPreview(placeholder: L10n.t(.chatSpeechListening))
          SCSpeechInputRecordButton()
        }
      )
      .accessibilityIdentifier("chat-voice")

      Button {
        if state.isBusy {
          Task { await state.abortSession() }
        } else {
          submit()
        }
      } label: {
        if isSending {
          ProgressView()
            .controlSize(.small)
        } else {
          Image(systemName: state.isBusy ? "stop.fill" : "arrow.up")
        }
      }
      .buttonStyle(.sc(state.isBusy ? .destructive : .default, size: .iconSM))
      .disabled(!state.isBusy && !canSend)
      .accessibilityLabel(state.isBusy ? L10n.t(.chatAbortAgent) : "Send message")
      .accessibilityIdentifier(state.isBusy ? "chat-stop" : "chat-send")
    }
    .frame(maxWidth: .infinity)
  }

  private var agentPicker: some View {
    SCDropdownMenu {
      SCDropdownMenuTrigger {
        HStack(spacing: 4) {
          Image(systemName: "person.crop.circle")
          Text(state.selectedAgent?.shortName ?? "Agent")
        }
      }
    } content: {
      SCDropdownMenuContent {
        ForEach(Array(state.visibleAgents.enumerated()), id: \.element.id) { index, agent in
          SCDropdownMenuItem {
            state.setSelectedAgentIndex(index)
          } label: {
            Label(agent.name, systemImage: index == state.selectedAgentIndex ? "checkmark" : "circle")
          }
        }
      }
    }
    .buttonStyle(.sc(.ghost, size: .sm))
    .accessibilityIdentifier("chat-agent-picker")
  }

  private var modelPicker: some View {
    SCDropdownMenu {
      SCDropdownMenuTrigger {
        HStack(spacing: 4) {
          ProviderMark(providerID: state.selectedModel?.providerID ?? "")
          Text(state.selectedModel?.shortName ?? "Model")
        }
      }
    } content: {
      SCDropdownMenuContent {
        ForEach(Array(state.modelPresets.enumerated()), id: \.element.id) { index, model in
          SCDropdownMenuItem {
            state.setSelectedModelIndex(index)
          } label: {
            HStack(spacing: 8) {
              ProviderMark(providerID: model.providerID)
              VStack(alignment: .leading, spacing: 1) {
                Text(model.displayName)
                Text(state.providerCatalog.first(where: { $0.id == model.providerID })?.name ?? model.providerID)
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              Spacer()
              if index == state.selectedModelIndex { Image(systemName: "checkmark") }
            }
          }
        }
      }
    }
    .buttonStyle(.sc(.ghost, size: .sm))
    .accessibilityIdentifier("chat-model-picker")
  }

  private var attachmentRow: some View {
    SCAttachmentGroup {
      ForEach(attachments) { attachment in
        SCAttachment(size: .small) {
          SCAttachmentMedia(variant: attachment.isImage ? .image : .icon) {
            attachmentImage(attachment)
          }
          SCAttachmentContent {
            SCAttachmentTitle(attachment.filename)
            SCAttachmentDescription(
              ByteCountFormatter.string(fromByteCount: Int64(attachment.byteSize), countStyle: .file)
            )
          }
          SCAttachmentActions {
            SCAttachmentAction {
              attachments.removeAll { $0.id == attachment.id }
            } label: {
              Image(systemName: "xmark")
            }
          }
        }
        .accessibilityIdentifier("chat-attachment-thumbnail")
      }

      if isLoadingAttachment {
        SCAttachment(state: .processing, size: .small) {
          SCAttachmentMedia { ProgressView() }
          SCAttachmentTitle("Preparing image")
        }
      }

      if let attachmentError {
        SCAttachment(state: .error, size: .small) {
          SCAttachmentMedia { Image(systemName: "exclamationmark.triangle") }
          SCAttachmentTitle(attachmentError)
        }
      }
    }
    .accessibilityIdentifier("chat-attachment-strip")
  }

  @ViewBuilder
  private func attachmentImage(_ attachment: ComposerImageAttachment) -> some View {
    #if canImport(UIKit)
      if let thumbnailData = attachment.thumbnailData, let image = UIImage(data: thumbnailData) {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else {
        Image(systemName: attachment.isImage ? "photo" : "doc")
      }
    #else
      Image(systemName: attachment.isImage ? "photo" : "doc")
    #endif
  }

  private func statusRow(_ message: String, systemImage: String) -> some View {
    Label(message, systemImage: systemImage)
      .font(.caption)
      .foregroundStyle(DesignColors.Semantic.error)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func submit() {
    guard canSend else { return }
    let submittedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let submittedAttachments = attachments
    text = ""
    attachments = []
    selectedPhotoItems = []
    isSending = true

    Task {
      let success = await onSubmit(submittedText, submittedAttachments)
      isSending = false
      if !success {
        text = submittedText
        attachments = submittedAttachments
      }
    }
  }

  private func loadSelectedPhotos(_ items: [PhotosPickerItem]) async {
    guard !items.isEmpty else { return }
    attachmentError = nil
    isLoadingAttachment = true
    defer {
      isLoadingAttachment = false
      selectedPhotoItems = []
    }

    for item in items {
      do {
        guard let data = try await item.loadTransferable(type: Data.self) else { continue }
        let attachment = try ComposerImageTranscoder.makeAttachment(from: data)
        guard supports(attachment) else { throw ComposerFileLoader.FileError.unsupported(attachment.mime) }
        attachments.append(attachment)
      } catch {
        attachmentError = error.localizedDescription
      }
    }
  }

  private func loadSelectedFiles(_ result: Result<[URL], Error>) {
    attachmentError = nil
    isLoadingAttachment = true
    defer { isLoadingAttachment = false }

    do {
      for url in try result.get() {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        let attachment = try ComposerFileLoader.makeAttachment(from: data, filename: url.lastPathComponent)
        guard supports(attachment) else { throw ComposerFileLoader.FileError.unsupported(attachment.mime) }
        attachments.append(attachment)
      }
    } catch {
      attachmentError = error.localizedDescription
    }
  }

  private func supports(_ attachment: ComposerAttachment) -> Bool {
    guard let model = state.selectedModel else { return false }
    if attachment.mime == "application/pdf" { return model.acceptsPDF }
    if attachment.isImage { return model.acceptsImages }
    return false
  }
}

private enum ComposerFileLoader {
  static let maxByteSize = 10 * 1024 * 1024

  enum FileError: LocalizedError {
    case tooLarge(Int)
    case unsupported(String)

    var errorDescription: String? {
      switch self {
      case .tooLarge(let bytes):
        return "File is too large (\(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)))."
      case .unsupported(let mime):
        return "The selected model does not support \(mime) attachments."
      }
    }
  }

  static func makeAttachment(from data: Data, filename: String) throws -> ComposerAttachment {
    guard data.count <= maxByteSize else { throw FileError.tooLarge(data.count) }
    let pathExtension = URL(fileURLWithPath: filename).pathExtension
    let mime = UTType(filenameExtension: pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    return ComposerAttachment(
      id: UUID(),
      filename: filename,
      mime: mime,
      dataURL: "data:\(mime);base64,\(data.base64EncodedString())",
      thumbnailData: nil,
      byteSize: data.count
    )
  }
}

#if canImport(UIKit)
  private enum ComposerImageTranscoder {
    static let maxDimension: CGFloat = 2048
    static let jpegQuality: CGFloat = 0.82
    static let maxByteSize = 5 * 1024 * 1024

    enum TranscodeError: LocalizedError {
      case invalidImage
      case tooLarge(Int)

      var errorDescription: String? {
        switch self {
        case .invalidImage:
          return L10n.t(.attachmentImageReadFailed)
        case .tooLarge(let bytes):
          return L10n.t(
            .attachmentImageTooLargeAfterCompression,
            ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
          )
        }
      }
    }

    static func makeAttachment(from data: Data) throws -> ComposerImageAttachment {
      guard let image = UIImage(data: data) else { throw TranscodeError.invalidImage }
      let resized = resize(image, maxDimension: maxDimension)
      guard let jpeg = resized.jpegData(compressionQuality: jpegQuality) else { throw TranscodeError.invalidImage }
      guard jpeg.count <= maxByteSize else { throw TranscodeError.tooLarge(jpeg.count) }
      let thumbnail = resize(resized, maxDimension: 240).jpegData(compressionQuality: 0.75) ?? jpeg
      let id = UUID()
      return ComposerImageAttachment(
        id: id,
        filename: "image-\(id.uuidString.prefix(8)).jpg",
        mime: "image/jpeg",
        dataURL: "data:image/jpeg;base64,\(jpeg.base64EncodedString())",
        thumbnailData: thumbnail,
        byteSize: jpeg.count
      )
    }

    private static func resize(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
      let longest = max(image.size.width, image.size.height)
      guard longest > maxDimension, longest > 0 else { return image }
      let scale = maxDimension / longest
      let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      return UIGraphicsImageRenderer(size: size).image { _ in
        image.draw(in: CGRect(origin: .zero, size: size))
      }
    }
  }
#endif
