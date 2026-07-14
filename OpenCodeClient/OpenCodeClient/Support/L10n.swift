import Foundation

nonisolated enum L10n {
  enum LanguagePreference: String, CaseIterable, Identifiable {
    case system
    case en

    var id: String { rawValue }

    var localeIdentifier: String? {
      switch self {
      case .system: return nil
      case .en: return "en"
      }
    }
  }

  static let languagePreferenceUserDefaultsKey = "languagePreference"

  enum Key: String, CaseIterable {
    case appChat
    case appClose
    case appDone
    case appLoading
    case appNoContent
    case appError
    case appSearchFiles
    case appSearchFilesTitle

    case commonOk
    case commonCancel
    case commonRetry

    case navFiles
    case navSettings
    case navPreview
    case navWorkspace
    case navSessions
    case sidebarHideSessions
    case sidebarShowSessions

    case contentPreviewUnavailableTitle
    case contentPreviewUnavailableDescription
    case contentRefreshHelp

    case settingsTitle
    case settingsServerConnection
    case settingsAddress
    case settingsUsername
    case settingsPassword
    case settingsScheme
    case settingsStatus
    case settingsConnected
    case settingsDisconnected
    case settingsTestConnection
    case settingsConnectionTip
    case settingsEnableSshTunnel
    case settingsAfterEnableSshTip
    case settingsVpsHost
    case settingsSshPort
    case settingsVpsPort
    case settingsAssignedRemotePort
    case settingsSetServerAddress
    case settingsKnownHost
    case settingsResetTrustedHost
    case settingsCopyPublicKey
    case settingsViewPublicKey
    case settingsReverseTunnelCommand
    case settingsNoTunnelCommand
    case settingsSshTunnel
    case settingsSshTunnelHelp
    case settingsSshSetupGuide
    case settingsSshSetupGuideTitle
    case settingsSshSetupGuideBody
    case settingsAutoTheme
    case settingsLightTheme
    case settingsDarkTheme
    case settingsAppearance
    case settingsTheme
    case settingsSpeechRecognition
    case settingsAiBuilderBaseURL
    case settingsAiBuilderToken
    case settingsCustomPrompt
    case settingsTerminology
    case settingsTesting
    case settingsTested
    case settingsAbout
    case settingsServerVersion
    case settingsRotateKeyTitle
    case settingsRotateKeyPrompt
    case settingsPublicKeyTitle
    case settingsPublicKeyFooter
    case settingsCopyToClipboard
    case settingsPublicKeyCopied
    case settingsPublicKeyCopyFailed
    case settingsPublicKeyRotate
    case settingsPublicKeyErrorTitle
    case settingsCopyCommand
    case settingsCommandCopied
    case settingsUntrusted
    case settingsRotate
    case settingsTrustHostKeyTitle
    case settingsTrustHostKeyMessage
    case settingsTrustHostKeyConfirm

    case settingsConnecting
    case settingsProject
    case settingsProjectServerDefault
    case settingsProjectCustomPath
    case settingsProjectCustomPathPlaceholder
    case settingsLanguage
    case settingsLanguageSystem
    case settingsLanguageEnglish
    case settingsLanguageChinese

    case hostCurrent
    case hostCurrentFooter
    case hostNoHost
    case hostAddToConnect
    case hostHosts
    case hostDelete
    case hostDuplicate
    case hostEdit
    case hostAdd
    case hostDeviceKey
    case hostCopyDevicePublicKey
    case hostDeviceKeyFooter
    case hostErrorTitle
    case hostNeverConnected
    case hostLastUsed
    case hostOverview
    case hostName
    case hostTransport
    case hostOpenCodeURL
    case hostStatus
    case hostManagedBySSHTunnel
    case hostSavedHost
    case hostSSHTunnel
    case hostSSHGateway
    case hostGatewayHost
    case hostSSHPort
    case hostSSHUsername
    case hostAssignedRemotePort
    case hostConnectionDiagnostics
    case hostUseThisHost
    case hostConfigCopied
    case hostCopyConfigJSON
    case hostNotFound
    case hostImportConfig
    case hostImportFooter
    case hostConnectionType
    case hostTransportFooter
    case hostSSHGatewayFooter
    case hostDeviceKeySendFooter
    case hostBasicAuth
    case hostSaveHelp
    case hostSave
    case hostEditTitle
    case hostAddTitle
    case hostTitle
    case hostTransportDirect
    case hostUntitled
    case hostDefaultLocalName
    case hostDefaultSSHName
    case hostDuplicateName
    case hostImportErrorDirectRequiresServerURL
    case hostImportErrorSSHTunnelRequiresSSHSettings
    case hostDeleteOnlyHostError
    case hostImportErrorInvalidUTF8
    case hostExportErrorEncodeConfigJSON
    case hostConnectionErrorInvalidURL
    case hostConnectionErrorBasicAuthRejected
    case hostConnectionErrorHTTPStatus
    case hostConnectionErrorCannotConnect
    case hostConnectionErrorTimedOut
    case hostConnectionErrorDNS
    case hostConnectionErrorNetwork
    case hostConnectionErrorHealthCheckFailed
    case hostConnectionErrorGeneric
    case hostDiagnosticCheckingHealth
    case hostDiagnosticCheckingHealthURL
    case hostDiagnosticConnectingSSHGateway
    case hostDiagnosticHintConfirmGateway
    case hostDiagnosticSSHTunnelFailed
    case hostDiagnosticHintCopyDeviceKeyAgain
    case hostDiagnosticTunnelReadyCheckingHealth
    case hostDiagnosticHintURLFormat
    case hostDiagnosticConnectedToOpenCode
    case hostDiagnosticHealthUnhealthy
    case hostDiagnosticHintCheckServerLogs
    case hostDiagnosticHintVerifyHostConfig
    case hostDiagnosticLocalListenerFailed
    case hostValidationVPSHostRequired
    case hostValidationSSHUsernameRequired
    case hostValidationSSHPortPositive
    case hostValidationAssignedRemotePortPositive
    case sshErrorConnectionFailed
    case sshErrorAuthenticationFailed
    case sshErrorKeyNotFound
    case sshErrorInvalidKeyFormat
    case sshErrorTunnelFailed
    case sshErrorHostKeyMismatch

    case connectionPhaseIdle
    case connectionPhaseSSHGateway
    case connectionPhaseSSHAuth
    case connectionPhaseLocalTunnel
    case connectionPhaseHealth
    case connectionPhaseBootstrap
    case connectionPhaseConnected
    case connectionPhaseFailed

    case chatInputPlaceholder
    case chatSendFailed
    case chatRenameSession
    case chatRenameSessionPlaceholder
    case chatTitleField
    case chatSpeechTitle
    case chatSelectSessionFirst
    case chatSessionBusyMessage
    case chatNoMessages
    case chatSessionBusy
    case chatSessionRetrying
    case chatSessionIdle
    case chatTurnCompleted
    case chatSpeechTokenMissing
    case chatSpeechTesting
    case chatSpeechNotPassed
    case chatSpeechStreamDisconnected
    case chatSpeechTapToSpeak
    case chatSpeechListening
    case chatSpeechTranscriptWillAppear
    case chatSpeechRecovering
    case chatSpeechTranscribing
    case chatSpeechTranscribingHint
    case chatSpeechPreservedAudio
    case chatSpeechStopWaiting
    case chatSpeechRetrySegment
    case chatSpeechDiscardAudio
    case chatAbortAgent
    case chatAgentRunning
    case chatMicrophoneDenied
    case chatSpeechRecognitionDenied
    case chatSpeechRecognizerUnavailable
    case chatSessionStatusBusy
    case chatSessionStatusRetrying
    case chatSessionStatusIdle
    case chatPullToLoadMore
    case chatLoadingMoreHistory
    case chatLargeMessagePreviewNotice
    case chatEditFromHere
    case chatForkFromHere
    case attachmentImageTitle
    case attachmentFileTitle
    case attachmentRemoveImageAccessibilityLabel
    case attachmentImageReadFailed
    case attachmentImageTooLargeAfterCompression

    case permissionRequired
    case permissionAllowOnce
    case permissionAllowAlways
    case permissionReject
    case questionTitle
    case questionSingleHint
    case questionMultiHint
    case questionTypeOwnAnswer
    case questionCustomPlaceholder
    case questionDismiss
    case questionSubmit
    case questionBack
    case questionNext
    case questionOf

    case toolReason
    case toolCommandInput
    case toolPath
    case toolOutput
    case toolOpenInFileTree
    case toolOpenFile
    case toolSelectFile
    case toolCallsCountOne
    case toolCallsCountMany
    case toolImageFile
    case toolReadFileAccessibilityLabel
    case toolWriteFileAccessibilityLabel
    case toolReadDirectoryAccessibilityLabel
    case folderEmptyTitle
    case folderEmptyDescription

    case patchFilesChangedOne
    case patchFilesChangedMany

    case contextUsageHelp
    case contextUsageClose
    case contextUsageTitle
    case contextUsageSectionSession
    case contextUsageSectionModel
    case contextUsageSectionTokens
    case contextUsageSectionCost
    case contextUsageTitleLabel
    case contextUsageIdLabel
    case contextUsageProviderLabel
    case contextUsageModelLabel
    case contextUsageLimitLabel
    case contextUsageTotalLabel
    case contextUsageInputLabel
    case contextUsageOutputLabel
    case contextUsageReasoningLabel
    case contextUsageCachedReadLabel
    case contextUsageCachedWriteLabel
    case contextUsageNoCostData
    case contextUsageLoadingConfig
    case contextUsageNoUsageData
    case contextUsageConfigNotLoaded

    case sessionTitle
    case sessionsTitle
    case sessionsEmptyTitle
    case sessionsEmptyDescription
    case sessionsClose
    case sessionsNew
    case sessionsUntitled
    case sessionsFilesOne
    case sessionsFilesMany
    case sessionsStatusBusy
    case sessionsStatusRetry
    case sessionsStatusIdle
    case sessionsActive
    case sessionsArchived
    case sessionsArchive
    case sessionsRestore
    case sessionsLoadMore
    case sessionsActionFailedTitle
    case sessionsDelete
    case sessionsDeleteConfirmTitle
    case sessionsDeleteConfirmMessage
    case sessionsDeleteFailedTitle

    case fileLoading
    case fileError
    case fileBinary
    case fileNoContent
    case fileMarkdown
    case filePreview
    case filePreviewMode
    case fileNativePreview
    case fileWebPreview
    case fileMarkdownSource
    case contentImageDecodeFailed
    case contentNoImageData
    case markdownPreviewLoading
    case markdownWebPreviewLoading
    case markdownWebPreviewLargeDocumentTitle
    case markdownWebPreviewLargeDocumentDescription
    case markdownWebPreviewRenderAnyway
    case markdownWebPreviewOpenNative
    case markdownWebPreviewOpenSource
    case markdownWebPreviewFailedTitle
    case markdownWebPreviewAssetsMissing
    case markdownWebPreviewPayloadEncodeFailed
    case markdownWebPreviewRenderCallFailed
    case markdownWebPreviewWebViewLoadFailed
    case markdownWebPreviewWebViewProvisionalLoadFailed
    case markdownWebPreviewUnknownRenderError

    case errorConnectionFailed
    case errorServerError
    case errorInvalidResponse
    case errorUnauthorized
    case errorSessionNotFound
    case errorFileNotFound
    case errorOperationFailed
    case errorUnknown
    case errorAiBuilderTokenEmpty
    case errorInvalidBaseURL
    case errorServerAddressEmpty
    case errorWanRequiresHttps
    case errorUsingLanHttp
    case helpLanHttp
    case helpWanHttp
    case helpTailscaleHttp

    case activityRetrying
    case activityThinking
    case activityDelegating
    case activityPlanning
    case activityGatheringContext
    case activitySearchingCodebase
    case activitySearchingWeb
    case activityMakingEdits
    case activityRunningCommands
    case activityGatheringThoughts
    case configureTitle
    case configureModel
    case configureAgent
    case configureNoAgents

    case todoButtonLabel
    case todoPanelTitle
    case todoPanelCompleted
    case todoPanelEmpty
    case todoUpdatedBadge
  }

  nonisolated private static let en: [String: String] = [
    Key.appChat.rawValue: "Chat",
    Key.appClose.rawValue: "Close",
    Key.appDone.rawValue: "Done",
    Key.appLoading.rawValue: "Loading...",
    Key.appNoContent.rawValue: "No content",
    Key.appError.rawValue: "Error",
    Key.appSearchFiles.rawValue: "Search files",
    Key.appSearchFilesTitle.rawValue: "Search files",
    Key.commonOk.rawValue: "OK",
    Key.commonCancel.rawValue: "Cancel",
    Key.commonRetry.rawValue: "Retry",
    Key.navFiles.rawValue: "Files",
    Key.navSettings.rawValue: "Settings",
    Key.navPreview.rawValue: "Preview",
    Key.navWorkspace.rawValue: "Workspace",
    Key.navSessions.rawValue: "Sessions",
    Key.sidebarHideSessions.rawValue: "Hide sessions",
    Key.sidebarShowSessions.rawValue: "Show sessions",
    Key.contentPreviewUnavailableTitle.rawValue: "Select file to preview",
    Key.contentPreviewUnavailableDescription.rawValue:
      "Choose file from Workspace, or use Open File in the Chat tool/patch cards.",
    Key.contentRefreshHelp.rawValue: "Refresh preview",

    Key.settingsTitle.rawValue: "Settings",
    Key.settingsServerConnection.rawValue: "Server Connection",
    Key.settingsAddress.rawValue: "Address",
    Key.settingsUsername.rawValue: "Username",
    Key.settingsPassword.rawValue: "Password",
    Key.settingsScheme.rawValue: "Scheme",
    Key.settingsStatus.rawValue: "Status",
    Key.settingsConnected.rawValue: "Connected",
    Key.settingsDisconnected.rawValue: "Disconnected",
    Key.settingsTestConnection.rawValue: "Test Connection",
    Key.settingsConnectionTip.rawValue: "AI Builder Base URL",
    Key.settingsEnableSshTunnel.rawValue: "Enable SSH Tunnel",
    Key.settingsAfterEnableSshTip.rawValue:
      "After enabling SSH Tunnel, tap Test Connection in Server Connection above.",
    Key.settingsVpsHost.rawValue: "VPS Host",
    Key.settingsSshPort.rawValue: "SSH Port",
    Key.settingsVpsPort.rawValue: "Remote Port",
    Key.settingsAssignedRemotePort.rawValue: "Assigned Remote Port",
    Key.settingsSetServerAddress.rawValue: "Set Server Address to 127.0.0.1:4096",
    Key.settingsKnownHost.rawValue: "Known Host",
    Key.settingsResetTrustedHost.rawValue: "Reset Trusted Host",
    Key.settingsCopyPublicKey.rawValue: "Copy Public Key",
    Key.settingsPublicKeyCopied.rawValue: "Public Key Copied",
    Key.settingsViewPublicKey.rawValue: "View Public Key",
    Key.settingsReverseTunnelCommand.rawValue: "SSH Tunnel Command",
    Key.settingsNoTunnelCommand.rawValue: "Fill Host, SSH Port, Username, and Assigned Remote Port.",
    Key.settingsSshTunnel.rawValue: "SSH Tunnel",
    Key.settingsSshTunnelHelp.rawValue:
      "Connects local 127.0.0.1:4096 through SSH to the assigned OpenCode remote port. Copy this device's public key to the server admin before connecting.",
    Key.settingsSshSetupGuide.rawValue: "Setup Guide",
    Key.settingsSshSetupGuideTitle.rawValue: "SSH Gateway Setup",
    Key.settingsSshSetupGuideBody.rawValue:
      "1. Tap Copy Public Key and send it to the server admin.\n\n2. The admin adds this device key to your user and gives you Host, SSH Port, Username, and Assigned Remote Port. For opencode-private-host, Username is usually opencode, SSH Port is usually 8006, and the first user's Remote Port is usually 19001.\n\n3. Fill those values here, enable SSH Tunnel, then tap Set Server Address to 127.0.0.1:4096.\n\n4. Tap Test Connection. The app will connect to local 127.0.0.1:4096; the SSH tunnel forwards it to your private OpenCode container.\n\n5. If provider auth is not configured yet, ask the admin to complete the first provider login in the OpenCode Web UI.",
    Key.settingsAutoTheme.rawValue: "Auto",
    Key.settingsLightTheme.rawValue: "Light",
    Key.settingsDarkTheme.rawValue: "Dark",
    Key.settingsAppearance.rawValue: "Appearance",
    Key.settingsTheme.rawValue: "Theme",
    Key.settingsSpeechRecognition.rawValue: "Speech Recognition",
    Key.settingsAiBuilderBaseURL.rawValue: "AI Builder Base URL",
    Key.settingsAiBuilderToken.rawValue: "AI Builder Token",
    Key.settingsCustomPrompt.rawValue: "Custom Prompt",
    Key.settingsTerminology.rawValue: "Terminology (comma-separated)",
    Key.settingsTesting.rawValue: "Testing...",
    Key.settingsTested.rawValue: "OK",
    Key.settingsAbout.rawValue: "About",
    Key.settingsServerVersion.rawValue: "Server Version",
    Key.settingsRotateKeyTitle.rawValue: "Rotate SSH Key?",
    Key.settingsRotateKeyPrompt.rawValue:
      "This will generate a new key pair for this device. Update the public key on your SSH server before using SSH tunnel hosts again.",
    Key.settingsPublicKeyTitle.rawValue: "Your Public Key",
    Key.settingsPublicKeyFooter.rawValue: "Send this public key to the server admin. Do not share your private key.",
    Key.settingsCopyToClipboard.rawValue: "Copy to Clipboard",
    Key.settingsPublicKeyCopyFailed.rawValue: "Unable to load SSH public key.",
    Key.settingsPublicKeyRotate.rawValue: "Rotate Key",
    Key.settingsPublicKeyErrorTitle.rawValue: "Public Key Error",
    Key.settingsCopyCommand.rawValue: "Copy Command",
    Key.settingsCommandCopied.rawValue: "Command Copied",
    Key.settingsUntrusted.rawValue: "Untrusted",
    Key.settingsRotate.rawValue: "Rotate",
    Key.settingsTrustHostKeyTitle.rawValue: "Trust New SSH Host Key?",
    Key.settingsTrustHostKeyMessage.rawValue:
      "%@:%d presented a different host key.\n\nPrevious: %@\nNew: %@\n\nTrust it only if you expected the server to be rebuilt or reinstalled.",
    Key.settingsTrustHostKeyConfirm.rawValue: "Trust and Reconnect",
    Key.settingsConnecting.rawValue: "Connecting...",
    Key.settingsProject.rawValue: "Project (Workspace)",
    Key.settingsProjectServerDefault.rawValue: "Server default",
    Key.settingsProjectCustomPath.rawValue: "Custom path",
    Key.settingsProjectCustomPathPlaceholder.rawValue: "/path/to/project",
    Key.settingsLanguage.rawValue: "Language",
    Key.settingsLanguageSystem.rawValue: "System",
    Key.settingsLanguageEnglish.rawValue: "English",
    Key.settingsLanguageChinese.rawValue: "Chinese",
    Key.hostCurrent.rawValue: "Current Host",
    Key.hostCurrentFooter.rawValue:
      "A host is one OpenCode environment. It can be reached directly over LAN, Tailscale, VPN, HTTPS, or through an SSH tunnel.",
    Key.hostNoHost.rawValue: "No Host",
    Key.hostAddToConnect.rawValue: "Add a host to connect",
    Key.hostHosts.rawValue: "Hosts",
    Key.hostDelete.rawValue: "Delete",
    Key.hostDuplicate.rawValue: "Duplicate",
    Key.hostEdit.rawValue: "Edit",
    Key.hostAdd.rawValue: "Add Host",
    Key.hostDeviceKey.rawValue: "Device Key",
    Key.hostCopyDevicePublicKey.rawValue: "Copy This Device Public Key",
    Key.hostDeviceKeyFooter.rawValue: "Use this same device key for SSH tunnel hosts. Direct hosts do not need it.",
    Key.hostErrorTitle.rawValue: "Host Error",
    Key.hostNeverConnected.rawValue: "Never connected",
    Key.hostLastUsed.rawValue: "Last used %@",
    Key.hostOverview.rawValue: "Overview",
    Key.hostName.rawValue: "Name",
    Key.hostTransport.rawValue: "Transport",
    Key.hostOpenCodeURL.rawValue: "OpenCode URL",
    Key.hostStatus.rawValue: "Status",
    Key.hostManagedBySSHTunnel.rawValue: "Managed by SSH tunnel",
    Key.hostSavedHost.rawValue: "Saved Host",
    Key.hostSSHTunnel.rawValue: "SSH Tunnel",
    Key.hostSSHGateway.rawValue: "SSH Gateway",
    Key.hostGatewayHost.rawValue: "Gateway Host",
    Key.hostSSHPort.rawValue: "SSH Port",
    Key.hostSSHUsername.rawValue: "SSH Username",
    Key.hostAssignedRemotePort.rawValue: "Assigned Remote Port",
    Key.hostConnectionDiagnostics.rawValue: "Connection Diagnostics",
    Key.hostUseThisHost.rawValue: "Use This Host",
    Key.hostConfigCopied.rawValue: "Host Config Copied",
    Key.hostCopyConfigJSON.rawValue: "Copy Host Config JSON",
    Key.hostNotFound.rawValue: "Host not found",
    Key.hostImportConfig.rawValue: "Import Host Config",
    Key.hostImportFooter.rawValue: "Paste a setup JSON from your server admin, or continue with manual setup below.",
    Key.hostConnectionType.rawValue: "Connection Type",
    Key.hostTransportFooter.rawValue:
      "Direct is for LAN, VPN, Tailscale, or HTTPS. SSH Tunnel is for an OpenCode server behind an SSH gateway.",
    Key.hostSSHGatewayFooter.rawValue:
      "These values come from your OpenCode host admin. The app connects locally through the tunnel after this is saved.",
    Key.hostDeviceKeySendFooter.rawValue:
      "Send this public key to the server admin before testing. Never share the private key.",
    Key.hostBasicAuth.rawValue: "Basic Auth",
    Key.hostSaveHelp.rawValue:
      "Save is enabled after required fields are present. Test verifies the selected transport and OpenCode health endpoint.",
    Key.hostSave.rawValue: "Save",
    Key.hostEditTitle.rawValue: "Edit Host",
    Key.hostAddTitle.rawValue: "Add Host",
    Key.hostTitle.rawValue: "Host",
    Key.hostTransportDirect.rawValue: "Direct",
    Key.hostUntitled.rawValue: "Untitled Host",
    Key.hostDefaultLocalName.rawValue: "Local OpenCode",
    Key.hostDefaultSSHName.rawValue: "SSH OpenCode",
    Key.hostDuplicateName.rawValue: "%@ Copy",
    Key.hostImportErrorDirectRequiresServerURL.rawValue: "Direct host config requires serverURL.",
    Key.hostImportErrorSSHTunnelRequiresSSHSettings.rawValue: "SSH Tunnel host config requires ssh settings.",
    Key.hostDeleteOnlyHostError.rawValue: "Add another host before deleting this one.",
    Key.hostImportErrorInvalidUTF8.rawValue: "Host config is not valid UTF-8.",
    Key.hostExportErrorEncodeConfigJSON.rawValue: "Could not encode Host Config JSON.",
    Key.hostConnectionErrorInvalidURL.rawValue: "Invalid OpenCode URL. Check the host address and port.",
    Key.hostConnectionErrorBasicAuthRejected.rawValue: "OpenCode rejected Basic Auth. Check username and password.",
    Key.hostConnectionErrorHTTPStatus.rawValue: "OpenCode returned HTTP %d. Check the server logs or provider setup.",
    Key.hostConnectionErrorCannotConnect.rawValue:
      "Could not connect to OpenCode. Check network reachability and that the server is running.",
    Key.hostConnectionErrorTimedOut.rawValue:
      "Connection timed out. Check the host, port, VPN/Tailscale, and firewall.",
    Key.hostConnectionErrorDNS.rawValue: "Host name could not be resolved. Check the gateway or server host spelling.",
    Key.hostConnectionErrorNetwork.rawValue: "Network error: %@",
    Key.hostConnectionErrorHealthCheckFailed.rawValue:
      "OpenCode health check failed. Check that the server is running and reachable.",
    Key.hostConnectionErrorGeneric.rawValue: "Connection failed. Check the host configuration and try again.",
    Key.hostDiagnosticCheckingHealth.rawValue: "Checking OpenCode health...",
    Key.hostDiagnosticCheckingHealthURL.rawValue: "Checking %@/global/health...",
    Key.hostDiagnosticConnectingSSHGateway.rawValue: "Connecting to SSH gateway...",
    Key.hostDiagnosticHintConfirmGateway.rawValue:
      "Confirm the gateway host, SSH port, device public key, and network reachability.",
    Key.hostDiagnosticSSHTunnelFailed.rawValue: "SSH tunnel failed: %@",
    Key.hostDiagnosticHintCopyDeviceKeyAgain.rawValue:
      "Copy this device public key again if the server has not authorized it.",
    Key.hostDiagnosticTunnelReadyCheckingHealth.rawValue: "SSH tunnel is ready; checking OpenCode health...",
    Key.hostDiagnosticHintURLFormat.rawValue: "Use host:port, http://host:port, or https://host:port.",
    Key.hostDiagnosticConnectedToOpenCode.rawValue: "Connected to OpenCode%@.",
    Key.hostDiagnosticHealthUnhealthy.rawValue: "OpenCode health check returned unhealthy.",
    Key.hostDiagnosticHintCheckServerLogs.rawValue: "Check the OpenCode server process and logs.",
    Key.hostDiagnosticHintVerifyHostConfig.rawValue:
      "For SSH tunnel hosts, first verify the gateway values and device key. For direct hosts, verify the URL from this device.",
    Key.hostDiagnosticLocalListenerFailed.rawValue: "Local listener failed: %@",
    Key.hostValidationVPSHostRequired.rawValue: "VPS Host is required",
    Key.hostValidationSSHUsernameRequired.rawValue: "SSH Username is required",
    Key.hostValidationSSHPortPositive.rawValue: "SSH Port must be > 0",
    Key.hostValidationAssignedRemotePortPositive.rawValue: "Assigned Remote Port must be > 0",
    Key.sshErrorConnectionFailed.rawValue: "Connection failed: %@",
    Key.sshErrorAuthenticationFailed.rawValue:
      "Authentication failed. Please check your public key is added to the server.",
    Key.sshErrorKeyNotFound.rawValue: "SSH key not found. Please generate a key pair first.",
    Key.sshErrorInvalidKeyFormat.rawValue: "Invalid SSH key format.",
    Key.sshErrorTunnelFailed.rawValue: "Tunnel failed: %@",
    Key.sshErrorHostKeyMismatch.rawValue:
      "Host key mismatch. Expected %@, got %@. This may be a MITM attack or a reinstalled server. Reset trusted host and verify fingerprint before reconnecting.",

    Key.connectionPhaseIdle.rawValue: "Idle",
    Key.connectionPhaseSSHGateway.rawValue: "Connecting to SSH gateway",
    Key.connectionPhaseSSHAuth.rawValue: "Authenticating with device key",
    Key.connectionPhaseLocalTunnel.rawValue: "Starting local tunnel",
    Key.connectionPhaseHealth.rawValue: "Checking OpenCode health",
    Key.connectionPhaseBootstrap.rawValue: "Loading projects and sessions",
    Key.connectionPhaseConnected.rawValue: "Connected",
    Key.connectionPhaseFailed.rawValue: "Connection failed",

    Key.chatInputPlaceholder.rawValue: "Ask anything...",
    Key.chatSendFailed.rawValue: "Send failed",
    Key.chatRenameSession.rawValue: "Rename Session",
    Key.chatRenameSessionPlaceholder.rawValue: "Input new title",
    Key.chatTitleField.rawValue: "Title",
    Key.chatSpeechTitle.rawValue: "Speech Recognition",
    Key.chatSelectSessionFirst.rawValue: "Please pick a session first",
    Key.chatSessionBusyMessage.rawValue: "Session is running, messages are not visible yet, refreshing...",
    Key.chatNoMessages.rawValue: "No messages yet",
    Key.chatSessionBusy.rawValue: "Busy",
    Key.chatSessionRetrying.rawValue: "Retrying...",
    Key.chatSessionIdle.rawValue: "Idle",
    Key.chatTurnCompleted.rawValue: "Completed",
    Key.chatSpeechTokenMissing.rawValue:
      "Speech recognition is not configured. Set AI Builder Token in Settings → Speech Recognition and tap Test Connection.",
    Key.chatSpeechTesting.rawValue: "AI Builder connection is being tested, please wait.",
    Key.chatSpeechNotPassed.rawValue:
      "AI Builder connection test failed. Go to Settings → Speech Recognition, tap Test Connection, and confirm it's OK before recording.",
    Key.chatSpeechStreamDisconnected.rawValue:
      "The speech connection was lost and couldn't recover. Tap stop and try again.",
    Key.chatSpeechTapToSpeak.rawValue: "Tap to speak",
    Key.chatSpeechListening.rawValue: "Listening...",
    Key.chatSpeechTranscriptWillAppear.rawValue: "Transcript will appear here...",
    Key.chatSpeechRecovering.rawValue: "Reconnecting voice...",
    Key.chatSpeechTranscribing.rawValue: "Transcribing...",
    Key.chatSpeechTranscribingHint.rawValue: "Finishing transcript...",
    Key.chatSpeechPreservedAudio.rawValue: "Audio saved. Retry this segment.",
    Key.chatSpeechStopWaiting.rawValue: "Stop transcription wait",
    Key.chatSpeechRetrySegment.rawValue: "Retry this segment",
    Key.chatSpeechDiscardAudio.rawValue: "Discard audio",
    Key.chatAbortAgent.rawValue: "Interrupt agent",
    Key.chatAgentRunning.rawValue: "Agent running",
    Key.chatMicrophoneDenied.rawValue: "Microphone permission denied",
    Key.chatSpeechRecognitionDenied.rawValue:
      "Speech recognition permission denied. Enable it in Settings > Privacy & Security > Speech Recognition.",
    Key.chatSpeechRecognizerUnavailable.rawValue: "Speech recognition is not available on this device right now.",
    Key.chatSessionStatusBusy.rawValue: "Running",
    Key.chatSessionStatusRetrying.rawValue: "Retrying",
    Key.chatSessionStatusIdle.rawValue: "Idle",
    Key.chatPullToLoadMore.rawValue: "Pull down to load more history",
    Key.chatLoadingMoreHistory.rawValue: "Loading more history...",
    Key.chatLargeMessagePreviewNotice.rawValue:
      "Large message: showing first %@ of %@ characters. Markdown rendering is skipped to keep the app responsive.",
    Key.chatEditFromHere.rawValue: "Edit from here",
    Key.chatForkFromHere.rawValue: "Fork from here",
    Key.attachmentImageTitle.rawValue: "Image",
    Key.attachmentFileTitle.rawValue: "Attachment",
    Key.attachmentRemoveImageAccessibilityLabel.rawValue: "Remove image",
    Key.attachmentImageReadFailed.rawValue: "Could not read the selected image.",
    Key.attachmentImageTooLargeAfterCompression.rawValue:
      "Image is too large after compression (%@ MB). Please choose a smaller image.",

    Key.permissionRequired.rawValue: "Permission Required",
    Key.permissionAllowOnce.rawValue: "Allow Once",
    Key.permissionAllowAlways.rawValue: "Allow Always",
    Key.permissionReject.rawValue: "Reject",
    Key.questionTitle.rawValue: "Question",
    Key.questionSingleHint.rawValue: "Select one option",
    Key.questionMultiHint.rawValue: "Select one or more options",
    Key.questionTypeOwnAnswer.rawValue: "Type your own answer",
    Key.questionCustomPlaceholder.rawValue: "Type your answer...",
    Key.questionDismiss.rawValue: "Dismiss",
    Key.questionSubmit.rawValue: "Submit",
    Key.questionBack.rawValue: "Back",
    Key.questionNext.rawValue: "Next",
    Key.questionOf.rawValue: "%d of %d",

    Key.toolReason.rawValue: "Reason",
    Key.toolCommandInput.rawValue: "Command / Input",
    Key.toolPath.rawValue: "Path",
    Key.toolOutput.rawValue: "Output",
    Key.toolOpenInFileTree.rawValue: "Open \"%@\" in File Tree",
    Key.toolOpenFile.rawValue: "Open File",
    Key.toolSelectFile.rawValue: "Select file to open",
    Key.toolCallsCountOne.rawValue: "%d tool call",
    Key.toolCallsCountMany.rawValue: "%d tool calls",
    Key.toolImageFile.rawValue: "Image file",
    Key.toolReadFileAccessibilityLabel.rawValue: "Read file %@",
    Key.toolWriteFileAccessibilityLabel.rawValue: "Write file %@",
    Key.toolReadDirectoryAccessibilityLabel.rawValue: "Read directory %@",
    Key.folderEmptyTitle.rawValue: "Empty folder",
    Key.folderEmptyDescription.rawValue: "This directory has no entries.",

    Key.patchFilesChangedOne.rawValue: "%d file changed",
    Key.patchFilesChangedMany.rawValue: "%d files changed",

    Key.contextUsageHelp.rawValue: "Context usage",
    Key.contextUsageClose.rawValue: "Close",
    Key.contextUsageTitle.rawValue: "Context",
    Key.contextUsageSectionSession.rawValue: "Session",
    Key.contextUsageSectionModel.rawValue: "Model",
    Key.contextUsageSectionTokens.rawValue: "Tokens",
    Key.contextUsageSectionCost.rawValue: "Cost",
    Key.contextUsageTitleLabel.rawValue: "Title",
    Key.contextUsageIdLabel.rawValue: "ID",
    Key.contextUsageProviderLabel.rawValue: "Provider",
    Key.contextUsageModelLabel.rawValue: "Model",
    Key.contextUsageLimitLabel.rawValue: "Context limit",
    Key.contextUsageTotalLabel.rawValue: "Total",
    Key.contextUsageInputLabel.rawValue: "Input",
    Key.contextUsageOutputLabel.rawValue: "Output",
    Key.contextUsageReasoningLabel.rawValue: "Reasoning",
    Key.contextUsageCachedReadLabel.rawValue: "Cached read",
    Key.contextUsageCachedWriteLabel.rawValue: "Cached write",
    Key.contextUsageNoCostData.rawValue: "No cost data",
    Key.contextUsageLoadingConfig.rawValue: "Loading provider config...",
    Key.contextUsageNoUsageData.rawValue: "No usage data",
    Key.contextUsageConfigNotLoaded.rawValue: "Provider config not loaded",

    Key.sessionTitle.rawValue: "Session",
    Key.sessionsTitle.rawValue: "Sessions",
    Key.sessionsEmptyTitle.rawValue: "No Sessions",
    Key.sessionsEmptyDescription.rawValue: "Tap + to create one, or pull to refresh for existing sessions.",
    Key.sessionsClose.rawValue: "Close",
    Key.sessionsNew.rawValue: "New",
    Key.sessionsUntitled.rawValue: "Untitled",
    Key.sessionsFilesOne.rawValue: "%d file",
    Key.sessionsFilesMany.rawValue: "%d files",
    Key.sessionsStatusBusy.rawValue: "Running",
    Key.sessionsStatusRetry.rawValue: "Retrying",
    Key.sessionsStatusIdle.rawValue: "Idle",
    Key.sessionsActive.rawValue: "Active",
    Key.sessionsArchived.rawValue: "Archived",
    Key.sessionsArchive.rawValue: "Archive",
    Key.sessionsRestore.rawValue: "Restore",
    Key.sessionsLoadMore.rawValue: "Load more sessions",
    Key.sessionsActionFailedTitle.rawValue: "Session Action Failed",
    Key.sessionsDelete.rawValue: "Delete",
    Key.sessionsDeleteConfirmTitle.rawValue: "Delete Session",
    Key.sessionsDeleteConfirmMessage.rawValue: "Delete this session and all its messages? This cannot be undone.",
    Key.sessionsDeleteFailedTitle.rawValue: "Delete Failed",

    Key.fileLoading.rawValue: "Loading...",
    Key.fileError.rawValue: "Error",
    Key.fileBinary.rawValue: "Binary file",
    Key.fileNoContent.rawValue: "No content",
    Key.fileMarkdown.rawValue: "Markdown",
    Key.filePreview.rawValue: "Preview",
    Key.filePreviewMode.rawValue: "Preview Mode",
    Key.fileNativePreview.rawValue: "Native Preview",
    Key.fileWebPreview.rawValue: "Web Preview",
    Key.fileMarkdownSource.rawValue: "Markdown Source",
    Key.contentImageDecodeFailed.rawValue: "Failed to decode image",
    Key.contentNoImageData.rawValue: "No image data",
    Key.markdownPreviewLoading.rawValue: "Loading preview...",
    Key.markdownWebPreviewLoading.rawValue: "Loading web preview...",
    Key.markdownWebPreviewLargeDocumentTitle.rawValue: "Large document",
    Key.markdownWebPreviewLargeDocumentDescription.rawValue:
      "This file is large. Web Preview may be slow or memory-heavy.",
    Key.markdownWebPreviewRenderAnyway.rawValue: "Render anyway",
    Key.markdownWebPreviewOpenNative.rawValue: "Open Native Preview",
    Key.markdownWebPreviewOpenSource.rawValue: "Open Markdown Source",
    Key.markdownWebPreviewFailedTitle.rawValue: "Web Preview failed",
    Key.markdownWebPreviewAssetsMissing.rawValue: "Web Preview assets missing from app bundle.",
    Key.markdownWebPreviewPayloadEncodeFailed.rawValue: "Failed to encode preview payload.",
    Key.markdownWebPreviewRenderCallFailed.rawValue: "Render call failed: %@",
    Key.markdownWebPreviewWebViewLoadFailed.rawValue: "WebView load failed: %@",
    Key.markdownWebPreviewWebViewProvisionalLoadFailed.rawValue: "WebView provisional load failed: %@",
    Key.markdownWebPreviewUnknownRenderError.rawValue: "Unknown render error",

    Key.errorConnectionFailed.rawValue: "Connection failed: %@",
    Key.errorServerError.rawValue: "Server error: %@",
    Key.errorInvalidResponse.rawValue: "Server returned invalid response",
    Key.errorUnauthorized.rawValue: "Unauthorized; check your credentials",
    Key.errorSessionNotFound.rawValue: "Session not found",
    Key.errorFileNotFound.rawValue: "File not found: %@",
    Key.errorOperationFailed.rawValue: "Operation failed: %@",
    Key.errorUnknown.rawValue: "Unknown error: %@",
    Key.errorAiBuilderTokenEmpty.rawValue: "Token is empty",
    Key.errorInvalidBaseURL.rawValue: "Invalid base URL",
    Key.errorServerAddressEmpty.rawValue: "Server address is empty",
    Key.errorWanRequiresHttps.rawValue: "WAN address must use HTTPS",
    Key.errorUsingLanHttp.rawValue: "Using HTTP on LAN",
    Key.helpLanHttp.rawValue: "LAN: HTTP is allowed only on trusted local networks.",
    Key.helpWanHttp.rawValue: "WAN: HTTPS is required. HTTP will be blocked.",
    Key.helpTailscaleHttp.rawValue: "Tailscale does not require HTTPS; other WAN addresses still require HTTPS.",

    Key.activityRetrying.rawValue: "Retrying",
    Key.activityThinking.rawValue: "Thinking",
    Key.activityDelegating.rawValue: "Delegating",
    Key.activityPlanning.rawValue: "Planning",
    Key.activityGatheringContext.rawValue: "Gathering context",
    Key.activitySearchingCodebase.rawValue: "Searching codebase",
    Key.activitySearchingWeb.rawValue: "Searching web",
    Key.activityMakingEdits.rawValue: "Making edits",
    Key.activityRunningCommands.rawValue: "Running commands",
    Key.activityGatheringThoughts.rawValue: "Gathering thoughts",

    Key.configureTitle.rawValue: "Configure",
    Key.configureModel.rawValue: "Model",
    Key.configureAgent.rawValue: "Agent",
    Key.configureNoAgents.rawValue: "No agents available",

    Key.todoButtonLabel.rawValue: "Todo",
    Key.todoPanelTitle.rawValue: "Todo",
    Key.todoPanelCompleted.rawValue: "%d/%d completed",
    Key.todoPanelEmpty.rawValue: "No todos yet",
    Key.todoUpdatedBadge.rawValue: "Todo updated · %d/%d",
  ]

  nonisolated static var languagePreference: LanguagePreference {
    get {
      let raw = UserDefaults.standard.string(forKey: languagePreferenceUserDefaultsKey)
      return raw.flatMap(LanguagePreference.init(rawValue:)) ?? .system
    }
    set {
      UserDefaults.standard.set(newValue.rawValue, forKey: languagePreferenceUserDefaultsKey)
    }
  }

  nonisolated static var currentLocale: Locale {
    if let identifier = languagePreference.localeIdentifier {
      return Locale(identifier: identifier)
    }
    return Locale.current
  }

  nonisolated static func t(_ key: Key) -> String {
    return en[key.rawValue] ?? key.rawValue
  }

  nonisolated static func t(_ key: Key, _ arguments: CVarArg...) -> String {
    let template = t(key)
    guard !arguments.isEmpty else { return template }
    return String(format: template, locale: currentLocale, arguments: arguments)
  }

  static func toolCallsCount(_ count: Int) -> String {
    let key: Key = count == 1 ? .toolCallsCountOne : .toolCallsCountMany
    return formatCount(key: key, count: count)
  }

  static func sessionsFiles(_ count: Int) -> String {
    let key: Key = count == 1 ? .sessionsFilesOne : .sessionsFilesMany
    return formatCount(key: key, count: count)
  }

  static func patchFilesChanged(_ count: Int) -> String {
    let key: Key = count == 1 ? .patchFilesChangedOne : .patchFilesChangedMany
    return formatCount(key: key, count: count)
  }

  private static func formatCount(key: Key, count: Int) -> String {
    t(key).replacingOccurrences(of: "%d", with: count.formatted(.number.locale(currentLocale)))
  }

  static func toolOpenFileLabel(path: String) -> String {
    return t(.toolOpenInFileTree, path)
  }

  static func helpForURLScheme(isLocal: Bool, isTailscale: Bool) -> String {
    if isTailscale { return t(.helpTailscaleHttp) }
    return isLocal ? t(.helpLanHttp) : t(.helpWanHttp)
  }

  static func errorMessage(_ key: Key, _ detail: String) -> String {
    return t(key, detail)
  }

  static var missingEnglishKeys: [String] {
    Key.allCases.map(\.rawValue).filter { en[$0] == nil }
  }

}
