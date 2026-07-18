//
//  VibePadUITestsLaunchTests.swift
//  VibePadUITests
//
//  Created by Yan Wang on 2/12/26.
//

import XCTest

final class VibePadUITestsLaunchTests: XCTestCase {

  override class var runsForEachTargetApplicationUIConfiguration: Bool {
    true
  }

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  @MainActor
  func testLaunch() {
    let app = XCUIApplication()
    app.launchArguments.append("UITEST_BYPASS_ONBOARDING")
    app.launch()

    // Insert steps here to perform after app launch but before taking a screenshot,
    // such as logging into a test account or navigating somewhere in the app

    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "Launch Screen"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
