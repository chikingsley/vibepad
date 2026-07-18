// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "VibePadCLI",
  platforms: [.macOS(.v14)],
  products: [
    .executable(name: "vibepad", targets: ["VibePadCLI"])
  ],
  dependencies: [
    .package(url: "https://github.com/apple/swift-argument-parser", from: "1.5.0")
  ],
  targets: [
    .executableTarget(
      name: "VibePadCLI",
      dependencies: [
        .product(name: "ArgumentParser", package: "swift-argument-parser")
      ]
    ),
    .testTarget(name: "VibePadCLITests", dependencies: ["VibePadCLI"]),
  ]
)
