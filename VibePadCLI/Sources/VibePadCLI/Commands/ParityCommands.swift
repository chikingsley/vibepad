import ArgumentParser
import Foundation

struct Parity: ParsableCommand {
  static let configuration = CommandConfiguration(
    abstract: "Inspect the pinned OpenCode parity contract.",
    subcommands: [ParityCheck.self]
  )
}

struct ParityCheck: ParsableCommand {
  static let configuration = CommandConfiguration(commandName: "check")

  @Flag(help: "Fail when the pinned OpenCode reference checkout is absent.")
  var requireUpstream = false

  func run() throws {
    try Self.verify(requireUpstream: requireUpstream)
  }

  static func verify(requireUpstream: Bool) throws {
    let repository = try Repository.locate()
    let fileManager = FileManager.default
    let metadataURL = repository.url("docs/parity/opencode-upstream.json")
    let matrixURL = repository.url("docs/OpenCode_Parity_Matrix.md")
    let lockURL = repository.url(".swiftcn.lock.json")
    let upstream = repository.url("References/OpenCode")

    let metadata = try JSONDecoder().decode(ParityMetadata.self, from: Data(contentsOf: metadataURL))
    guard metadata.schemaVersion == 1, metadata.commit.count == 40, !metadata.capabilities.isEmpty else {
      throw CLIError.message("Invalid OpenCode parity metadata.")
    }
    guard Set(metadata.capabilities.map(\.id)).count == metadata.capabilities.count else {
      throw CLIError.message("OpenCode parity capability IDs must be unique.")
    }

    let matrix = try String(contentsOf: matrixURL, encoding: .utf8)
    for capability in metadata.capabilities where !matrix.contains("`\(capability.id)`") {
      throw CLIError.message("Parity matrix is missing capability: \(capability.id)")
    }

    let lock = try JSONSerialization.jsonObject(with: Data(contentsOf: lockURL)) as? [String: Any]
    let installedItems = lock?["items"] as? [String: Any] ?? [:]
    for item in metadata.swiftcnItems where installedItems[item] == nil {
      throw CLIError.message("SwiftCN lock is missing required item: \(item)")
    }

    guard fileManager.fileExists(atPath: upstream.appending(path: ".git").path) else {
      if requireUpstream {
        throw CLIError.message("Missing pinned OpenCode checkout at \(upstream.path)")
      }
      print("OpenCode parity metadata valid; reference checkout absent, source/API checks skipped.")
      return
    }

    let actualCommit = try ProcessRunner().run("git", ["rev-parse", "HEAD"], in: upstream, captureOutput: true)
    guard actualCommit == metadata.commit else {
      throw CLIError.message("OpenCode pin mismatch: expected \(metadata.commit), found \(actualCommit)")
    }

    let openAPIURL = upstream.appending(path: metadata.openapi)
    guard fileManager.fileExists(atPath: openAPIURL.path) else {
      throw CLIError.message("Missing pinned OpenAPI document: \(metadata.openapi)")
    }
    let openAPI = try JSONSerialization.jsonObject(with: Data(contentsOf: openAPIURL)) as? [String: Any]
    let paths = openAPI?["paths"] as? [String: Any] ?? [:]

    for capability in metadata.capabilities {
      for source in capability.upstreamSources
      where !fileManager.fileExists(atPath: upstream.appending(path: source).path) {
        throw CLIError.message("\(capability.id) references missing upstream source: \(source)")
      }
      for path in capability.apiPaths where paths[path] == nil {
        throw CLIError.message("\(capability.id) references missing OpenAPI path: \(path)")
      }
      if capability.implementation != "missing",
        !fileManager.fileExists(atPath: repository.url(capability.nativeOwner).path)
      {
        throw CLIError.message("\(capability.id) is \(capability.implementation) but has no native owner.")
      }
    }

    print("OpenCode parity pin, sources, API paths, SwiftCN inventory, and native owners are valid.")
  }
}

private struct ParityMetadata: Decodable {
  let schemaVersion: Int
  let commit: String
  let openapi: String
  let swiftcnItems: [String]
  let capabilities: [Capability]

  enum CodingKeys: String, CodingKey {
    case schemaVersion = "schema_version"
    case commit, openapi, capabilities
    case swiftcnItems = "swiftcn_items"
  }

  struct Capability: Decodable {
    let id: String
    let upstreamSources: [String]
    let apiPaths: [String]
    let nativeOwner: String
    let implementation: String

    enum CodingKeys: String, CodingKey {
      case id, implementation
      case upstreamSources = "upstream_sources"
      case apiPaths = "api_paths"
      case nativeOwner = "native_owner"
    }
  }
}
