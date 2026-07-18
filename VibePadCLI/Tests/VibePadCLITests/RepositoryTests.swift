import Foundation
import Testing

@testable import VibePadCLI

@Test func repositoryURLsResolveFromTheRoot() {
  let root = URL(fileURLWithPath: "/tmp/vibepad")
  let repository = Repository(root: root)
  #expect(repository.url("VibePad/App").path == "/tmp/vibepad/VibePad/App")
}

@Test func simulatorResolverPrefersAnAvailableBootedIPad() throws {
  let json = Data(
    #"{"devices":{"runtime":[{"name":"iPad Air","udid":"shutdown-ipad","state":"Shutdown","isAvailable":true},{"name":"VibePad iPad","udid":"booted-ipad","state":"Booted","isAvailable":true},{"name":"iPhone 17","udid":"booted-phone","state":"Booted","isAvailable":true}]}}"#
      .utf8
  )

  #expect(
    try SimulatorDestinationResolver.resolve(from: json)
      == "platform=iOS Simulator,id=booted-ipad"
  )
}
