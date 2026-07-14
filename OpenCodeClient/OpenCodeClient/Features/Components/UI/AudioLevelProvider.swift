// ============================================================
// AudioLevelProvider.swift — swiftcn-ui (Audio)
// Depends on: nothing
//
// The audio-engine seam for the elevenlabs-ui audio ports.
// Upstream binds Web Audio directly: `live-waveform` opens
// `getUserMedia` plus an `AnalyserNode` itself, and
// `bar-visualizer` reads a `MediaStream` through its
// `useAudioVolume` / `useMultibandVolume` hooks. Those are
// platform services, not UI, so the Swift ports invert the
// dependency: the views poll this provider for normalized
// frequency bands at the upstream update rates while the
// rendering contract stays 1:1. Analyser configuration that
// upstream exposes as props (`deviceId`, `fftSize`,
// `smoothingTimeConstant`, `loPass`/`hiPass`) belongs to the
// conforming engine, not to the views.
// ============================================================
import SwiftUI

// MARK: - Provider

/// A source of normalized audio levels for `SCLiveWaveform` and
/// `SCBarVisualizer` — the Swift seam that replaces upstream's embedded
/// Web Audio `AnalyserNode` binding. Conform with AVAudioEngine, a capture
/// session, a playback tap, or a network meter; the views poll on the main
/// actor while they are active.
///
///     final class MicrophoneLevels: SCAudioLevelProvider {
///         func levels(bandCount: Int) -> [Float] {
///             analyzer.magnitudes(resampledTo: bandCount)  // each 0…1
///         }
///     }
///
///     SCLiveWaveform(active: isRecording, levels: microphoneLevels)
@MainActor
public protocol SCAudioLevelProvider: AnyObject {
  /// The current spectrum, resampled to `bandCount` bands ordered from
  /// low to high frequency. Every value must be normalized to `0…1`
  /// (the analog of `getByteFrequencyData` divided by 255). Returning
  /// fewer than `bandCount` values is tolerated; missing bands read as
  /// silence.
  func levels(bandCount: Int) -> [Float]
}
