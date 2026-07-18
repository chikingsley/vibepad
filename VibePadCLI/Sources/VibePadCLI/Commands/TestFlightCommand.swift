import ArgumentParser
import Foundation

struct TestFlight: ParsableCommand {
  static let configuration = CommandConfiguration(
    abstract: "Archive and upload VibePad to App Store Connect.",
    subcommands: [TestFlightUpload.self]
  )
}

struct TestFlightUpload: ParsableCommand {
  static let configuration = CommandConfiguration(commandName: "upload")

  @Option(help: "Explicit build number. Defaults to a UTC timestamp.")
  var buildNumber: String?

  func run() throws {
    let repository = try Repository.locate()
    let environment = ProcessInfo.processInfo.environment
    let keyID = try required("VIBEPAD_ASC_KEY_ID", in: environment)
    let issuerID = try required("VIBEPAD_ASC_ISSUER_ID", in: environment)
    let keyPath = try required("VIBEPAD_ASC_KEY_PATH", in: environment)
    guard FileManager.default.fileExists(atPath: keyPath) else {
      throw CLIError.message("App Store Connect API key not found: \(keyPath)")
    }

    let number = buildNumber ?? Self.timestampBuildNumber()
    let archive = "build/VibePad-\(number).xcarchive"
    let export = "build/export-\(number)"
    let authentication = [
      "-allowProvisioningUpdates",
      "-authenticationKeyID", keyID,
      "-authenticationKeyIssuerID", issuerID,
      "-authenticationKeyPath", keyPath,
    ]
    let runner = ProcessRunner()

    print("Archiving VibePad build \(number)…")
    try runner.run(
      "xcodebuild",
      [
        "archive", "-project", "VibePad.xcodeproj", "-scheme", "VibePad",
        "-destination", "generic/platform=iOS", "-archivePath", archive,
      ] + authentication + ["CURRENT_PROJECT_VERSION=\(number)"],
      in: repository.root
    )

    print("Uploading VibePad build \(number) to App Store Connect…")
    try runner.run(
      "xcodebuild",
      [
        "-exportArchive", "-archivePath", archive,
        "-exportOptionsPlist", "Config/ExportOptions.plist", "-exportPath", export,
      ] + authentication,
      in: repository.root
    )
    print("Uploaded build \(number).")
  }

  private func required(_ name: String, in environment: [String: String]) throws -> String {
    guard let value = environment[name], !value.isEmpty else {
      throw CLIError.message("Set \(name) before uploading to TestFlight.")
    }
    return value
  }

  private static func timestampBuildNumber() -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyyMMddHHmm"
    return formatter.string(from: Date())
  }
}
