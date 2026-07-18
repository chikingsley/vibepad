# Swift-native VibePad archive

The original SwiftUI VibePad implementation is preserved in Git rather than
kept as a second application inside the active source tree.

- Archive branch: `archive/swift-native`
- Archive tag: `swift-native-final-2026-07-18`
- Last product shape: native iPad client with OpenCode v2 sessions, chat,
  permissions, questions, files, SSH host profiles, voice, and preview work

To inspect or build the archived implementation without disturbing current
work, create a separate worktree:

```sh
git worktree add ../vibepad-swift-native archive/swift-native
```

The active `main` branch is the TypeScript/Expo rewrite. Product requirements
and parity research remain useful, but Swift-specific source layout and build
instructions apply only to the archive.

The archive records the final in-progress native reorganization as it existed
before the Expo rewrite. Treat it as preserved implementation evidence, not as
a claim that every simulator test had completed successfully.
