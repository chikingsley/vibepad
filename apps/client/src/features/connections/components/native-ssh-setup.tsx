import { decodePairingInvitationUrl } from "@vibepad/protocol/auth";
import { createHostProfile } from "@vibepad/protocol/settings";
import SshBootstrap from "@vibepad/ssh-bootstrap";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { Platform, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppSettingsStore } from "@/features/settings/settings-context";
import { THEME } from "@/lib/theme";
import { useVibePadHost } from "@/lib/vibepad-host-context";

import { pairHostInvitation } from "../pair-host";

const expoNativeError =
  /^(?:[A-Za-z]+):\s*(.*?)\s+\(at ExpoModulesCore\/.*\)$/u;
const expoNativeCause = /→ Caused by: [^:]+:\s*(.*?)(?=\s+\(at|$)/su;

const messageForError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return "SSH setup failed";
  }
  return (
    expoNativeCause.exec(error.message)?.[1] ??
    expoNativeError.exec(error.message)?.[1] ??
    error.message
  );
};

export function NativeSshSetup() {
  const hostClient = useVibePadHost();
  const { update } = useAppSettingsStore();
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const toggle = useCallback(() => {
    setOpen((current) => !current);
    setMessage(undefined);
  }, []);

  const setup = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage("Installing VibePad Host…");
    try {
      const result = await SshBootstrap.installAndPairAsync({
        automaticStart: false,
        enabledComponents: [
          "vibepad-host",
          "codex",
          "opencode",
          "browser-tools",
        ],
        host: host.trim(),
        name: host.trim(),
        password,
        username: username.trim(),
      });
      const invitation = decodePairingInvitationUrl(result.invitationUrl);
      if (!invitation) {
        throw new Error("The computer returned an invalid pairing invitation");
      }
      setMessage(`Pairing ${invitation.hostName}…`);
      const { endpoint, paired } = await pairHostInvitation(
        hostClient,
        invitation.endpoints,
        invitation.code
      );
      update((current) => ({
        ...current,
        connections: {
          activeHostId: paired.hostId,
          hosts: [
            ...current.connections.hosts.filter(
              (candidate) => candidate.id !== paired.hostId
            ),
            createHostProfile({
              id: paired.hostId,
              name: paired.hostName,
              url: endpoint,
            }),
          ],
        },
      }));
      setPassword("");
      setMessage(`${paired.hostName} is ready`);
    } catch (error) {
      setMessage(messageForError(error));
    } finally {
      setBusy(false);
    }
  }, [busy, host, hostClient, password, update, username]);

  if (Platform.OS !== "ios") {
    return null;
  }

  return (
    <View className="gap-3">
      <Button
        accessibilityLabel={open ? "Cancel SSH setup" : "Set up with SSH"}
        className="min-h-11 self-start"
        onPress={toggle}
        testID="native-ssh-open"
        variant="outline"
      >
        <Icon name={open ? "x" : "laptop"} size={14} />
        <Text>{open ? "Cancel" : "Set up with SSH"}</Text>
      </Button>
      {open ? (
        <View
          className="gap-4 rounded-xl border border-border bg-card p-4"
          testID="native-ssh-form"
        >
          <Text className="text-sm leading-6" variant="muted">
            Enter the computer&apos;s SSH login. VibePad installs and starts the
            Host, then pairs this device automatically.
          </Text>
          <View className="gap-3 sm:flex-row">
            <View className="min-w-0 flex-1 gap-1.5">
              <Text className="font-medium text-sm">Computer</Text>
              <TextInput
                accessibilityLabel="Computer address"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-12 rounded-lg border border-border bg-muted/40 px-3 text-base text-foreground outline-none"
                onChangeText={setHost}
                placeholder="hojo or 100.x.y.z"
                placeholderTextColor={theme.mutedForeground}
                selectionColor={theme.primary}
                style={{ color: theme.foreground }}
                testID="native-ssh-host"
                value={host}
              />
            </View>
            <View className="min-w-0 flex-1 gap-1.5">
              <Text className="font-medium text-sm">SSH user</Text>
              <TextInput
                accessibilityLabel="SSH user"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-12 rounded-lg border border-border bg-muted/40 px-3 text-base text-foreground outline-none"
                onChangeText={setUsername}
                placeholder="simon"
                placeholderTextColor={theme.mutedForeground}
                selectionColor={theme.primary}
                style={{ color: theme.foreground }}
                testID="native-ssh-username"
                value={username}
              />
            </View>
          </View>
          <View className="gap-1.5">
            <Text className="font-medium text-sm">SSH password</Text>
            <TextInput
              accessibilityLabel="SSH password"
              autoCapitalize="none"
              autoCorrect={false}
              className="h-12 rounded-lg border border-border bg-muted/40 px-3 text-base text-foreground outline-none"
              onChangeText={setPassword}
              onSubmitEditing={setup}
              placeholder="Password"
              placeholderTextColor={theme.mutedForeground}
              secureTextEntry
              selectionColor={theme.primary}
              style={{ color: theme.foreground }}
              submitBehavior="blurAndSubmit"
              testID="native-ssh-password"
              value={password}
            />
          </View>
          <Button
            className="min-h-12"
            disabled={
              busy ||
              host.trim().length === 0 ||
              username.trim().length === 0 ||
              password.length === 0
            }
            onPress={setup}
            testID="native-ssh-submit"
          >
            <Text>{busy ? "Setting up…" : "Install and connect"}</Text>
          </Button>
          {message ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-xs leading-5"
              testID="native-ssh-message"
              variant="muted"
            >
              {message}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
