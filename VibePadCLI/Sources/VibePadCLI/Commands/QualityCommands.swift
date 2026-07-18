import ArgumentParser
import Foundation

struct Format: ParsableCommand {
  static let configuration = CommandConfiguration(abstract: "Format all VibePad Swift source.")

  func run() throws {
    let repository = try Repository.locate()
    try ProcessRunner().run(
      "swift-format",
      [
        "format", "--configuration", ".swift-format", "--in-place", "--parallel", "--recursive",
        "VibePad", "VibePadTests", "VibePadUITests", "VibePadCLI/Sources", "VibePadCLI/Tests",
      ],
      in: repository.root
    )
  }
}

struct Lint: ParsableCommand {
  static let configuration = CommandConfiguration(abstract: "Run formatting, SwiftLint, parity, and provider checks.")

  func run() throws {
    let repository = try Repository.locate()
    let runner = ProcessRunner()
    try runner.run(
      "swift-format",
      [
        "lint", "--configuration", ".swift-format", "--parallel", "--recursive", "--strict",
        "VibePad", "VibePadTests", "VibePadUITests", "VibePadCLI/Sources", "VibePadCLI/Tests",
      ],
      in: repository.root
    )
    try runner.run("swiftlint", ["lint", "--strict"], in: repository.root)
    try ParityCheck.verify(requireUpstream: false)
    try ProvidersCheck().run()
  }
}

struct Build: ParsableCommand {
  static let configuration = CommandConfiguration(abstract: "Build VibePad for a generic iOS Simulator.")

  func run() throws {
    let repository = try Repository.locate()
    try ProcessRunner().run(
      "xcodebuild",
      [
        "-project", "VibePad.xcodeproj", "-scheme", "VibePad",
        "-destination", "generic/platform=iOS Simulator", "CODE_SIGNING_ALLOWED=NO", "build",
      ],
      in: repository.root
    )
  }
}

struct Test: ParsableCommand {
  static let configuration = CommandConfiguration(abstract: "Run the native VibePad test suite.")

  @Option(help: "Explicit simulator destination used by xcodebuild. Defaults to an available iPad.")
  var destination: String?

  func run() throws {
    let repository = try Repository.locate()
    let runner = ProcessRunner()
    let resolvedDestination =
      try destination ?? SimulatorDestinationResolver.resolve(using: runner, in: repository.root)
    try ProcessRunner().run(
      "xcodebuild",
      [
        "-project", "VibePad.xcodeproj", "-scheme", "VibePad", "-destination", resolvedDestination,
        "CODE_SIGNING_ALLOWED=NO", "test",
      ],
      in: repository.root
    )
  }
}
