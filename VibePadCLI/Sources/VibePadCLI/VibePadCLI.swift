import ArgumentParser

@main
struct VibePadCLI: AsyncParsableCommand {
  static let configuration = CommandConfiguration(
    commandName: "vibepad",
    abstract: "Develop, verify, and release VibePad.",
    subcommands: [
      Format.self,
      Lint.self,
      Build.self,
      Test.self,
      Parity.self,
      Providers.self,
      TestFlight.self,
    ]
  )
}
