import Foundation

enum SimulatorDestinationResolver {
  private struct DeviceList: Decodable {
    let devices: [String: [Device]]
  }

  private struct Device: Decodable {
    let name: String
    let udid: String
    let state: String
    let isAvailable: Bool?
  }

  static func resolve(using runner: ProcessRunner, in directory: URL) throws -> String {
    let output = try runner.run(
      "xcrun",
      ["simctl", "list", "devices", "available", "--json"],
      in: directory,
      captureOutput: true
    )
    return try resolve(from: Data(output.utf8))
  }

  static func resolve(from data: Data) throws -> String {
    let list = try JSONDecoder().decode(DeviceList.self, from: data)
    let iPads = list.devices.values
      .flatMap { $0 }
      .filter { ($0.isAvailable ?? true) && $0.name.localizedCaseInsensitiveContains("iPad") }
      .sorted { left, right in
        if left.state == "Booted" && right.state != "Booted" { return true }
        if right.state == "Booted" && left.state != "Booted" { return false }
        return left.name.localizedStandardCompare(right.name) == .orderedAscending
      }

    guard let selected = iPads.first else {
      throw CLIError.message(
        "No available iPad simulator is installed. Pass --destination to select another simulator.")
    }
    return "platform=iOS Simulator,id=\(selected.udid)"
  }
}
