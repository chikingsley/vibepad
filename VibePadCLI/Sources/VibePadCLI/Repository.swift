import Foundation

enum CLIError: LocalizedError {
  case message(String)

  var errorDescription: String? {
    switch self {
    case .message(let message): message
    }
  }
}

struct Repository: Sendable {
  let root: URL

  static func locate(from start: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)) throws -> Self {
    var candidate = start.standardizedFileURL
    while candidate.path != "/" {
      if FileManager.default.fileExists(atPath: candidate.appending(path: "VibePad.xcodeproj").path),
        FileManager.default.fileExists(atPath: candidate.appending(path: "VibePad").path)
      {
        return Repository(root: candidate)
      }
      candidate.deleteLastPathComponent()
    }
    throw CLIError.message("Could not locate the VibePad repository root.")
  }

  func url(_ relativePath: String) -> URL {
    root.appending(path: relativePath)
  }
}

struct ProcessRunner: Sendable {
  @discardableResult
  func run(
    _ executable: String,
    _ arguments: [String],
    in directory: URL,
    environment additions: [String: String] = [:],
    captureOutput: Bool = false
  ) throws -> String {
    let process = Process()
    process.currentDirectoryURL = directory
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = [executable] + arguments
    process.environment = ProcessInfo.processInfo.environment.merging(additions) { _, new in new }

    let pipe = Pipe()
    if captureOutput {
      process.standardOutput = pipe
    }
    process.standardError = FileHandle.standardError

    try process.run()
    let data = captureOutput ? pipe.fileHandleForReading.readDataToEndOfFile() : Data()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
      throw CLIError.message("\(executable) exited with status \(process.terminationStatus).")
    }
    return (String(data: data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

extension FileManager {
  func replaceDirectory(at destination: URL, with source: URL) throws {
    if fileExists(atPath: destination.path) {
      try removeItem(at: destination)
    }
    try copyItem(at: source, to: destination)
  }
}
