//
//  OpenCodeClientUITests.swift
//  OpenCodeClientUITests
//
//  Created by Yan Wang on 2/12/26.
//

import XCTest

final class OpenCodeClientUITests: XCTestCase {

  override func setUpWithError() throws {
    // Put setup code here. This method is called before the invocation of each test method in the class.

    // In UI tests it is usually best to stop immediately when a failure occurs.
    continueAfterFailure = false

    // In UI tests it’s important to set the initial state - such as interface orientation - required for your tests before they run. The setUp method is a good place to do this.
  }

  override func tearDownWithError() throws {
    // Put teardown code here. This method is called after the invocation of each test method in the class.
  }

  @MainActor
  func testExample() {
    let app = XCUIApplication()
    app.launch()
  }

  /// 2.3 ChatTabView baseline: 验证 Chat 页加载后输入框可见（refactor 后用此测试回归）
  @MainActor
  func testChatTabShowsInputField() {
    let app = XCUIApplication()
    app.launch()
    let askField = app.textViews["chat-input"]
    XCTAssertTrue(askField.waitForExistence(timeout: 8), "Chat 输入框应可见")
  }

  @MainActor
  func testChatComposerLongInputRemainsScrollable() {
    let app = XCUIApplication()
    app.launch()

    let composer = app.textViews["chat-input"]
    XCTAssertTrue(composer.waitForExistence(timeout: 8), "Chat 输入框应可见")

    composer.tap()
    composer.typeText((1...18).map { "Line \($0)" }.joined(separator: "\n"))
    composer.swipeUp()

    let screenshot = composer.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = "chat-composer-long-input"
    attachment.lifetime = .keepAlways
    add(attachment)

    let composerValue = composer.value as? String ?? ""
    XCTAssertTrue(composerValue.contains("Line 18"), "输入框应保留完整长文本内容")
  }

  @MainActor
  func testSessionListFixtureShowsArchiveSections() {
    let app = XCUIApplication()
    app.launchArguments.append("UITEST_SESSION_TREE_FIXTURE")
    app.launch()

    // Compact layouts open the session sheet from the toolbar; regular iPad
    // layouts already render the session list as the leading column.
    if app.buttons["chat-toolbar-session-list"].waitForExistence(timeout: 1) {
      app.buttons["chat-toolbar-session-list"].tap()
    }

    XCTAssertTrue(app.staticTexts["Root Session"].waitForExistence(timeout: 8), "Root session 应可见")
    XCTAssertTrue(app.staticTexts["Child Session"].waitForExistence(timeout: 8), "Child session 应可见，避免回归到 root-only 列表")
    XCTAssertTrue(app.staticTexts["Archived"].waitForExistence(timeout: 8), "Archived section header 应可见")

    app.staticTexts["Archived"].tap()

    XCTAssertTrue(app.staticTexts["Archived Session"].waitForExistence(timeout: 8), "Archived session 应可见")
    XCTAssertTrue(app.staticTexts["Archived Child"].waitForExistence(timeout: 8), "Archived child 应可见")

    let screenshot = XCUIScreen.main.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = "session-archive-fixture"
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  @MainActor
  func testCaptureSessionArchiveFixtureScreenshot() throws {
    guard let path = tier4ScreenshotPath(), !path.isEmpty else {
      throw XCTSkip("Set TIER4_SCREENSHOT_PATH to write a deterministic archive UI screenshot")
    }

    let app = XCUIApplication()
    app.launchArguments.append("UITEST_SESSION_TREE_FIXTURE")
    app.launch()

    if app.buttons["chat-toolbar-session-list"].waitForExistence(timeout: 8) {
      app.buttons["chat-toolbar-session-list"].tap()
    }

    XCTAssertTrue(app.staticTexts["Archived"].waitForExistence(timeout: 8), "Archived section header 应可见")
    app.staticTexts["Archived"].tap()
    XCTAssertTrue(app.staticTexts["Archived Session"].waitForExistence(timeout: 8), "Archived session 应可见")
    XCTAssertTrue(app.staticTexts["Archived Child"].waitForExistence(timeout: 8), "Archived child 应可见")

    let data = XCUIScreen.main.screenshot().pngRepresentation
    try data.write(to: URL(fileURLWithPath: path))
  }

  @MainActor
  func testHostProfilesListFixture() throws {
    let app = launchHostProfilesFixture()

    openSettingsInHostProfilesFixture(app)
    app.buttons["settings-current-host"].tap()

    XCTAssertTrue(app.navigationBars["Hosts"].waitForExistence(timeout: 8), "Hosts 页面应打开")
    XCTAssertTrue(app.staticTexts["Local OpenCode"].waitForExistence(timeout: 8), "默认 Direct host 应可见")
    XCTAssertTrue(app.staticTexts["SSH Lab"].exists, "SSH tunnel host 应可见")
    XCTAssertTrue(reveal(app.buttons["hosts-add-host"], in: app), "Add Host 入口应可见")
    XCTAssertTrue(reveal(app.buttons["hosts-copy-device-public-key"], in: app), "设备公钥复制入口应可见")
  }

  @MainActor
  func testHostProfileDetailShowsSSHTunnelFields() throws {
    let app = launchHostProfilesFixture()

    openSettingsInHostProfilesFixture(app)
    app.buttons["settings-current-host"].tap()
    XCTAssertTrue(app.navigationBars["Hosts"].waitForExistence(timeout: 8), "Hosts 页面应打开")
    app.staticTexts["SSH Lab"].tap()

    XCTAssertTrue(app.navigationBars["SSH Lab"].waitForExistence(timeout: 8), "SSH Host 详情应打开")
    XCTAssertTrue(app.buttons["host-detail-use-this-host"].exists, "非当前 host 应显示显式切换按钮")
    let copyConfigButton = app.buttons["host-detail-copy-config"]
    if !copyConfigButton.waitForExistence(timeout: 1) {
      app.swipeUp()
    }
    XCTAssertTrue(copyConfigButton.waitForExistence(timeout: 8), "详情应支持复制 Host Config JSON")
  }

  @MainActor
  func testCaptureHostProfilesFixtureScreenshots() throws {
    let dir =
      ProcessInfo.processInfo.environment["HOST_PROFILES_SCREENSHOT_DIR"] ?? "/tmp/opencode-host-profiles-screenshots"

    let app = launchHostProfilesFixture(extraArguments: ["UITEST_HOST_IMPORT_JSON_PREFILL"])
    openSettingsInHostProfilesFixture(app)
    try writeScreenshot(named: "host_profiles_settings_current_host", directory: dir)

    app.buttons["settings-current-host"].tap()
    XCTAssertTrue(app.navigationBars["Hosts"].waitForExistence(timeout: 8))
    try writeScreenshot(named: "host_profiles_list", directory: dir)

    app.staticTexts["SSH Lab"].tap()
    XCTAssertTrue(app.navigationBars["SSH Lab"].waitForExistence(timeout: 8))
    try writeScreenshot(named: "host_profiles_detail_ssh", directory: dir)
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Hosts"].waitForExistence(timeout: 8))

    let addHostButton = app.buttons["hosts-add-host"]
    XCTAssertTrue(reveal(addHostButton, in: app))
    addHostButton.tap()
    XCTAssertTrue(app.navigationBars["Add Host"].waitForExistence(timeout: 8))
    try writeScreenshot(named: "host_profiles_add_import_prefill", directory: dir)

    app.buttons["host-import-config"].tap()
    XCTAssertFalse(app.textFields["host-server-url"].exists, "SSH mode should hide editable direct URL field")
    try writeScreenshot(named: "host_profiles_add_ssh_after_import", directory: dir)
  }

  @MainActor
  func testAddDirectHostProfileFlow() throws {
    let app = launchHostProfilesFixture()
    openSettingsInHostProfilesFixture(app)
    app.buttons["settings-current-host"].tap()
    let addHostButton = app.buttons["hosts-add-host"]
    XCTAssertTrue(reveal(addHostButton, in: app))
    addHostButton.tap()

    XCTAssertTrue(app.navigationBars["Add Host"].waitForExistence(timeout: 8))
    app.textFields["host-name"].tap()
    app.textFields["host-name"].typeText("Tailscale Mac")
    app.textFields["host-server-url"].tap()
    app.textFields["host-server-url"].typeText("https://tailnet.example.invalid:4096")
    app.buttons["host-save"].tap()

    XCTAssertTrue(app.navigationBars["Hosts"].waitForExistence(timeout: 8))
    XCTAssertTrue(reveal(app.staticTexts["Tailscale Mac"], in: app), "新 Direct host 应保存并显示")
    XCTAssertTrue(app.staticTexts["https://tailnet.example.invalid:4096"].exists)
  }

  @MainActor
  func testImportSSHTunnelHostProfileFlow() throws {
    let app = launchHostProfilesFixture(extraArguments: ["UITEST_HOST_IMPORT_JSON_PREFILL"])
    openSettingsInHostProfilesFixture(app)
    app.buttons["settings-current-host"].tap()
    let addHostButton = app.buttons["hosts-add-host"]
    XCTAssertTrue(reveal(addHostButton, in: app))
    addHostButton.tap()

    let importEditor = app.textViews["host-import-json"]
    XCTAssertTrue(importEditor.waitForExistence(timeout: 8))
    XCTAssertTrue(
      app.buttons["host-import-config"].waitForExistence(timeout: 8), "Import Host Config button should exist")
    XCTAssertTrue(
      app.buttons["host-import-config"].isEnabled, "Import Host Config button should be enabled after JSON paste")
    app.buttons["host-import-config"].tap()

    XCTAssertFalse(app.textFields["host-server-url"].exists, "SSH mode should hide editable direct URL field")
    app.buttons["host-save"].tap()

    XCTAssertTrue(app.navigationBars["Hosts"].waitForExistence(timeout: 8))
    XCTAssertTrue(reveal(app.staticTexts["Imported SSH"], in: app))
    XCTAssertTrue(app.staticTexts["gateway.example.invalid:8006 -> :19001"].exists)
  }

  private func tier4ScreenshotPath() -> String? {
    if let path = ProcessInfo.processInfo.environment["TIER4_SCREENSHOT_PATH"], !path.isEmpty {
      return path
    }

    let url = URL(fileURLWithPath: "/tmp/opencode-ios-tier4-config.json")
    guard let data = try? Data(contentsOf: url),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    return object["screenshot_path"] as? String
  }

  @MainActor
  private func writeScreenshot(named name: String, directory dir: String) throws {
    let screenshot = XCUIScreen.main.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)

    let directory = URL(fileURLWithPath: dir, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try screenshot.pngRepresentation.write(to: directory.appendingPathComponent("\(name).png"))
  }

  @MainActor
  private func launchHostProfilesFixture(extraArguments: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["UITEST_HOST_PROFILES_FIXTURE"] + extraArguments
    app.launch()
    return app
  }

  @MainActor
  private func openSettingsInHostProfilesFixture(_ app: XCUIApplication) {
    if app.buttons["settings-current-host"].waitForExistence(timeout: 3) {
      return
    }
    if app.tabBars.buttons["Settings"].exists {
      app.tabBars.buttons["Settings"].tap()
    } else if app.buttons["Settings"].exists {
      app.buttons["Settings"].tap()
    }
    XCTAssertTrue(app.buttons["settings-current-host"].waitForExistence(timeout: 8), "Settings 应显示 Current Host")
  }

  @MainActor
  private func reveal(_ element: XCUIElement, in app: XCUIApplication, maximumSwipes: Int = 4) -> Bool {
    let hostForm = app.descendants(matching: .any)["hosts-form"]
    for _ in 0..<maximumSwipes {
      if element.waitForExistence(timeout: 1), element.isHittable {
        return true
      }
      if hostForm.exists {
        hostForm.swipeUp()
      } else {
        app.swipeUp()
      }
    }
    return element.exists && element.isHittable
  }

  @MainActor
  func testLaunchPerformance() {
    // This measures how long it takes to launch your application.
    measure(metrics: [XCTApplicationLaunchMetric()]) {
      XCUIApplication().launch()
    }
  }
}
