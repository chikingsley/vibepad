//
//  AppleSpeechSession.swift
//  OpenCodeClient
//
//  On-device speech engine behind the vendored `SCSpeechInput` seam:
//  Apple's Speech framework (SFSpeechRecognizer) fed by an AVAudioEngine
//  input tap. Conforms to `SCSpeechInputSession` for transcripts/status
//  and to `SCAudioLevelProvider` for waveform levels.
//

import AVFoundation
import Accelerate
import Foundation
import Observation
import Speech
import os

/// Errors surfaced by `AppleSpeechSession.start()` — reported through
/// `SCSpeechInput`'s `onError` callback.
nonisolated enum AppleSpeechSessionError: LocalizedError {
  case microphonePermissionDenied
  case speechRecognitionPermissionDenied
  case recognizerUnavailable

  var errorDescription: String? {
    switch self {
    case .microphonePermissionDenied:
      return L10n.t(.chatMicrophoneDenied)
    case .speechRecognitionPermissionDenied:
      return L10n.t(.chatSpeechRecognitionDenied)
    case .recognizerUnavailable:
      return L10n.t(.chatSpeechRecognizerUnavailable)
    }
  }
}

/// Realtime speech-to-text session on Apple's Speech framework.
///
/// Lifecycle mirrors the `SCSpeechInputSession` contract:
/// `disconnected → connecting (permissions + audio setup) → connected →
/// transcribing (partials flowing) → disconnected`. Recognition failures
/// move to `.error` with a message in `error`.
///
/// Recognition runs in segments: an `SFSpeechRecognitionTask` ends at its
/// first final result, so on `isFinal` the transcript is appended to
/// `committedTranscripts` and a fresh request is attached to the running
/// audio tap, letting long dictation continue seamlessly.
@MainActor
@Observable
final class AppleSpeechSession: SCSpeechInputSession, SCAudioLevelProvider {
  private(set) var status: SCSpeechInputStatus = .disconnected
  private(set) var partialTranscript = ""
  private(set) var committedTranscripts: [String] = []
  private(set) var error: String?

  @ObservationIgnored private var recognizer: SFSpeechRecognizer?
  @ObservationIgnored private var audioEngine: AVAudioEngine?
  @ObservationIgnored private var recognitionTask: SFSpeechRecognitionTask?
  @ObservationIgnored private var segmentGeneration = 0
  @ObservationIgnored private let audioRelay = SpeechRecognitionAudioRelay()
  @ObservationIgnored private let levelMeter = SpeechAudioLevelMeter()

  // MARK: SCSpeechInputSession

  func start() async throws {
    guard status != .connecting, !isConnected else { return }
    error = nil
    status = .connecting
    do {
      try await Self.requestPermissions()
      try beginCapture()
      status = .connected
    } catch {
      teardownCapture()
      self.error = error.localizedDescription
      status = .error
      throw error
    }
  }

  func stop() {
    guard status != .disconnected || audioEngine != nil else { return }
    teardownCapture()
    status = .disconnected
  }

  func clearTranscripts() {
    partialTranscript = ""
    committedTranscripts = []
  }

  // MARK: SCAudioLevelProvider

  /// The most recent `bandCount` smoothed loudness samples, newest first.
  /// Speech recognition exposes no frequency spectrum, so this is a
  /// single-band RMS history spread across bands rather than an analyser
  /// snapshot from low to high frequency.
  func levels(bandCount: Int) -> [Float] {
    levelMeter.recentLevels(count: bandCount)
  }

  // MARK: Permissions

  private static func requestPermissions() async throws {
    let speechStatus = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status)
      }
    }
    guard speechStatus == .authorized else {
      throw AppleSpeechSessionError.speechRecognitionPermissionDenied
    }
    guard await AVAudioApplication.requestRecordPermission() else {
      throw AppleSpeechSessionError.microphonePermissionDenied
    }
  }

  // MARK: Capture

  private func beginCapture() throws {
    guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
      throw AppleSpeechSessionError.recognizerUnavailable
    }
    self.recognizer = recognizer

    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
    try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

    levelMeter.reset()
    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    let relay = audioRelay
    let meter = levelMeter
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputNode.outputFormat(forBus: 0)) { buffer, _ in
      relay.append(buffer)
      meter.ingest(buffer)
    }
    engine.prepare()
    try engine.start()
    audioEngine = engine

    startRecognitionSegment(using: recognizer)
  }

  private func teardownCapture() {
    // Invalidate in-flight recognition callbacks before tearing down so a
    // late partial/final/error from the recognizer queue is ignored.
    segmentGeneration += 1
    if let engine = audioEngine {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
    }
    audioEngine = nil
    audioRelay.finish()
    recognitionTask?.finish()
    recognitionTask = nil
    recognizer = nil
    levelMeter.reset()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  // MARK: Recognition

  private func startRecognitionSegment(using recognizer: SFSpeechRecognizer) {
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition {
      request.requiresOnDeviceRecognition = true
    }
    audioRelay.activate(request)

    segmentGeneration += 1
    let generation = segmentGeneration
    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      let transcript = result?.bestTranscription.formattedString
      let isFinal = result?.isFinal ?? false
      let failureMessage = error?.localizedDescription
      Task { @MainActor [weak self] in
        self?.handleRecognitionEvent(
          generation: generation,
          transcript: transcript,
          isFinal: isFinal,
          failureMessage: failureMessage
        )
      }
    }
  }

  private func handleRecognitionEvent(
    generation: Int,
    transcript: String?,
    isFinal: Bool,
    failureMessage: String?
  ) {
    guard generation == segmentGeneration else { return }
    if let failureMessage {
      teardownCapture()
      error = failureMessage
      status = .error
      return
    }
    guard let transcript else { return }
    if isFinal {
      commitSegment(transcript)
    } else {
      partialTranscript = transcript
      if status == .connected {
        status = .transcribing
      }
    }
  }

  private func commitSegment(_ transcript: String) {
    let cleaned = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    if !cleaned.isEmpty {
      committedTranscripts.append(cleaned)
    }
    partialTranscript = ""
    // A recognition task ends at its first final result; attach a fresh
    // request to the running tap so recording continues.
    if isConnected, let recognizer {
      startRecognitionSegment(using: recognizer)
    }
  }
}

// MARK: - Audio relay

/// Thread-safe hand-off between the audio tap (realtime audio thread) and
/// the current recognition request, which is swapped on the main actor
/// whenever a segment finalizes.
nonisolated final class SpeechRecognitionAudioRelay: Sendable {
  private let request = OSAllocatedUnfairLock<SFSpeechAudioBufferRecognitionRequest?>(uncheckedState: nil)

  func activate(_ newRequest: SFSpeechAudioBufferRecognitionRequest) {
    request.withLockUnchecked { current in
      current?.endAudio()
      current = newRequest
    }
  }

  func append(_ buffer: AVAudioPCMBuffer) {
    request.withLockUnchecked { current in
      current?.append(buffer)
    }
  }

  func finish() {
    request.withLockUnchecked { current in
      current?.endAudio()
      current = nil
    }
  }
}

// MARK: - Level meter

/// Single-band microphone loudness history for `SCAudioLevelProvider`.
/// The audio tap writes RMS-derived, exponentially smoothed levels into a
/// small ring buffer; the main actor reads the most recent values.
nonisolated final class SpeechAudioLevelMeter: Sendable {
  private struct Meter {
    var history: [Float] = []
    var smoothed: Float = 0
  }

  private static let capacity = 64
  private static let smoothing: Float = 0.35
  /// Loudness below this dBFS floor reads as silence.
  static let silenceFloorDB: Float = -50

  private let meter = OSAllocatedUnfairLock(initialState: Meter())

  func ingest(_ buffer: AVAudioPCMBuffer) {
    guard let channel = buffer.floatChannelData?.pointee, buffer.frameLength > 0 else { return }
    let samples = UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength))
    let level = Self.normalizedLevel(rms: vDSP.rootMeanSquare(samples))
    meter.withLock { state in
      state.smoothed += (level - state.smoothed) * Self.smoothing
      state.history.append(state.smoothed)
      if state.history.count > Self.capacity {
        state.history.removeFirst(state.history.count - Self.capacity)
      }
    }
  }

  /// The most recent `count` smoothed levels, newest first, each `0…1`.
  func recentLevels(count: Int) -> [Float] {
    guard count > 0 else { return [] }
    return meter.withLock { state in
      Array(state.history.suffix(count).reversed())
    }
  }

  func reset() {
    meter.withLock { $0 = Meter() }
  }

  /// Maps an RMS sample to `0…1` on a dBFS scale over
  /// `silenceFloorDB…0`, the analog of `getByteFrequencyData / 255`.
  static func normalizedLevel(rms: Float) -> Float {
    guard rms > 0 else { return 0 }
    let decibels = 20 * log10(rms)
    guard decibels > silenceFloorDB else { return 0 }
    guard decibels < 0 else { return 1 }
    return (decibels - silenceFloorDB) / -silenceFloorDB
  }
}
