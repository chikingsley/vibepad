import type {
  ComputerComponentId,
  ComputerComponentInspection,
  InstallationStep,
  NearbyComputer,
  OnboardingPlatform,
  OnboardingState,
  SshConnectionInput,
} from "@vibepad/protocol/onboarding";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { VibePadMark } from "@/components/brand/vibepad-mark";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  type PairedHostResult,
  PairingCodeForm,
} from "@/features/connections/components/pairing-code-form";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

export interface OnboardingActions {
  readonly back?: (() => void) | undefined;
  readonly chooseExistingHost?: (computerId?: string) => void;
  readonly chooseSelfHosted?: () => void;
  readonly chooseSshSetup?: () => void;
  readonly completeExistingPairing?: (result: PairedHostResult) => void;
  readonly continueFromInspection?: (automaticStart: boolean) => void;
  readonly finish?: () => void;
  readonly inspectComputer?: (input: SshConnectionInput) => void;
  readonly start?: () => void;
  readonly toggleComponent?: (componentId: ComputerComponentId) => void;
}

const platformLabel: Record<OnboardingPlatform, string> = {
  ipad: "iPad",
  iphone: "iPhone",
  web: "browser",
};

const componentLabel: Record<ComputerComponentId, string> = {
  "browser-tools": "Browser tools",
  codex: "Codex",
  opencode: "OpenCode",
  "vibepad-host": "VibePad Host",
};

const stepLabel: Record<InstallationStep["id"], string> = {
  "configure-automatic-start": "Configure automatic start",
  "connect-ssh": "Connect securely",
  inspect: "Check computer",
  "install-browser-tools": "Install browser tools",
  "install-codex": "Install Codex",
  "install-opencode": "Install OpenCode",
  "install-vibepad-host": "Install VibePad Host",
  "pair-device": "Pair this device",
  "start-host": "Start VibePad Host",
  "start-providers": "Start coding providers",
};

function OnboardingFrame({
  back,
  children,
  testID,
}: {
  readonly back?: (() => void) | undefined;
  readonly children: React.ReactNode;
  readonly testID: string;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="min-h-full justify-center px-5 py-10 sm:px-10"
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        <View className="mx-auto w-full max-w-3xl gap-7">
          {back ? (
            <Button
              accessibilityLabel="Go back"
              className="self-start"
              onPress={back}
              size="icon"
              testID="onboarding-back"
              variant="ghost"
            >
              <Icon name="chevron-left" size={18} />
            </Button>
          ) : null}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function OnboardingHeading({
  children,
  detail,
}: {
  readonly children: React.ReactNode;
  readonly detail: string;
}) {
  return (
    <View className="items-center gap-3 text-center">
      <VibePadMark className="size-14" />
      <Text className="text-center font-semibold text-3xl tracking-tight sm:text-4xl">
        {children}
      </Text>
      <Text
        className="max-w-xl text-center text-base leading-6"
        variant="muted"
      >
        {detail}
      </Text>
    </View>
  );
}

function ChoiceCard({
  detail,
  disabled,
  icon,
  label,
  onPress,
  testID,
}: {
  readonly detail: string;
  readonly disabled?: boolean | undefined;
  readonly icon: "browser" | "laptop" | "search";
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
  readonly testID: string;
}) {
  return (
    <Button
      className="h-auto min-h-28 flex-1 items-start justify-start rounded-2xl p-5"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      variant="outline"
    >
      <View className="size-10 items-center justify-center rounded-xl bg-muted">
        <Icon name={icon} size={18} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold">{label}</Text>
        <Text className="text-sm leading-5" variant="muted">
          {detail}
        </Text>
      </View>
    </Button>
  );
}

function WelcomeScreen({ actions, platform }: ScreenProps) {
  return (
    <OnboardingFrame testID="onboarding-welcome">
      <View className="items-center gap-8">
        <OnboardingHeading detail="Your coding agents, projects, and browser stay on your computer.">
          Code from your {platformLabel[platform]}
        </OnboardingHeading>
        <Button
          className="h-12 min-w-44 rounded-xl"
          onPress={actions.start}
          testID="onboarding-connect"
        >
          <Text>Connect</Text>
          <Icon name="chevron-right" size={16} />
        </Button>
      </View>
    </OnboardingFrame>
  );
}

function RuntimeChoiceScreen({ actions }: ScreenProps) {
  return (
    <OnboardingFrame back={actions.back} testID="onboarding-runtime-choice">
      <OnboardingHeading detail="Choose where your projects and coding agents run.">
        Where VibePad runs
      </OnboardingHeading>
      <View className="mx-auto w-full max-w-2xl gap-3 sm:flex-row">
        <ChoiceCard
          detail="Managed computers are coming soon."
          disabled
          icon="browser"
          label="VibePad Hosted"
          testID="onboarding-hosted"
        />
        <ChoiceCard
          detail="Run everything on a computer you control."
          icon="laptop"
          label="Your computer"
          onPress={actions.chooseSelfHosted}
          testID="onboarding-self-hosted"
        />
      </View>
    </OnboardingFrame>
  );
}

function ComputerResultRow({
  computer,
  onSelect,
}: {
  readonly computer: NearbyComputer;
  readonly onSelect?: ((computerId?: string) => void) | undefined;
}) {
  const select = useCallback(
    () => onSelect?.(computer.id),
    [computer.id, onSelect]
  );
  return (
    <Pressable
      accessibilityLabel={`Pair ${computer.name}`}
      className="min-h-12 flex-row items-center gap-3 border-border border-b px-4 py-3 last:border-b-0 active:bg-accent"
      onPress={select}
      testID={`onboarding-computer-${computer.id}`}
    >
      <Icon name="laptop" size={16} />
      <Text className="min-w-0 flex-1 font-medium" numberOfLines={1}>
        {computer.name}
      </Text>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm" variant="muted">
          Pair
        </Text>
        <Icon
          className="text-muted-foreground"
          name="chevron-right"
          size={14}
        />
      </View>
    </Pressable>
  );
}

function ComputerChoiceScreen({ actions, state }: ScreenProps) {
  const chooseSingleHost = useCallback(
    () => actions.chooseExistingHost?.(),
    [actions]
  );
  if (state.screen !== "computer-choice") {
    return null;
  }
  const { discovery } = state;
  const severalComputers =
    discovery.status === "ready" && discovery.computers.length > 1;
  let existingHostDetail = "Run VibePad Host, then pair with its code or QR.";
  if (discovery.status === "searching") {
    existingHostDetail = "Searching your local network…";
  } else if (discovery.status === "ready") {
    existingHostDetail = `Found ${discovery.computers[0]?.name}`;
  } else if (discovery.status === "empty") {
    existingHostDetail =
      "No computers running VibePad Host were found nearby. Scan the Host QR code with your camera, or set up over SSH.";
  }
  return (
    <OnboardingFrame back={actions.back} testID="onboarding-computer-choice">
      <OnboardingHeading detail="Use a running VibePad Host, or install it securely over SSH.">
        Connect your computer
      </OnboardingHeading>
      <View className="mx-auto w-full max-w-2xl gap-3 sm:flex-row">
        {severalComputers ? (
          <View
            className="flex-1 overflow-hidden rounded-2xl border border-border bg-card"
            testID="onboarding-computer-list"
          >
            {discovery.computers.map((computer) => (
              <ComputerResultRow
                computer={computer}
                key={computer.id}
                onSelect={actions.chooseExistingHost}
              />
            ))}
          </View>
        ) : (
          <ChoiceCard
            detail={existingHostDetail}
            icon="search"
            label="VibePad Host is running"
            onPress={chooseSingleHost}
            testID="onboarding-existing-host"
          />
        )}
        <ChoiceCard
          detail="Sign in to your computer and let VibePad install the Host."
          icon="laptop"
          label="Set up this computer"
          onPress={actions.chooseSshSetup}
          testID="onboarding-ssh-setup"
        />
      </View>
      {discovery.status === "permission-required" ||
      discovery.status === "error" ? (
        <Text
          className="text-center text-red-600 text-sm"
          testID="onboarding-discovery-message"
        >
          {discovery.message}
        </Text>
      ) : null}
    </OnboardingFrame>
  );
}

function PairExistingScreen({ actions, state }: ScreenProps) {
  if (state.screen !== "pair-existing") {
    return null;
  }
  return (
    <OnboardingFrame back={actions.back} testID="onboarding-pair-existing">
      <OnboardingHeading
        detail={`Enter the code shown by VibePad Host on ${state.computer.name}.`}
      >
        Pair {state.computer.name}
      </OnboardingHeading>
      <View className="mx-auto w-full max-w-md">
        <PairingCodeForm
          codeFieldTestID="onboarding-pairing-code"
          computer={state.computer}
          layout="stacked"
          onPaired={actions.completeExistingPairing}
          submitTestID="onboarding-pair-submit"
        />
      </View>
    </OnboardingFrame>
  );
}

function Field({
  keyboardType,
  label,
  onChangeText,
  placeholder,
  testID,
  value,
  widthClass,
}: {
  readonly keyboardType?: "default" | "number-pad" | undefined;
  readonly label: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder: string;
  readonly testID: string;
  readonly value: string;
  readonly widthClass?: string;
}) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  return (
    <View className={cn("min-w-0 gap-1.5", widthClass)}>
      <Text className="font-medium text-sm">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoComplete={label === "Password" ? "off" : undefined}
        autoCorrect={false}
        className="h-12 rounded-xl border border-border bg-card px-3 text-foreground outline-none"
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        secureTextEntry={label === "Password"}
        selectionColor={theme.primary}
        style={{ color: theme.foreground }}
        testID={testID}
        textContentType={label === "Password" ? "none" : undefined}
        value={value}
      />
    </View>
  );
}

type SshConnectionDefaults = Omit<SshConnectionInput, "password">;

function SshCredentialsScreen({
  actions,
  initialValues,
  platform,
  state,
}: ScreenProps & { readonly initialValues?: SshConnectionDefaults }) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [host, setHost] = useState(initialValues?.host ?? "");
  const [port, setPort] = useState(String(initialValues?.port ?? 22));
  const [username, setUsername] = useState(initialValues?.username ?? "");
  const [password, setPassword] = useState("");
  const inspect = useCallback(() => {
    actions.inspectComputer?.({
      host: host.trim(),
      name: name.trim(),
      password,
      port: Number(port),
      username: username.trim(),
    });
  }, [actions, host, name, password, port, username]);
  if (state.screen !== "ssh-credentials") {
    return null;
  }
  const checking = state.inspectionStatus === "checking";
  let actionLabel = "Check computer";
  if (checking) {
    actionLabel = "Checking…";
  } else if (platform === "web") {
    actionLabel = "Open installer";
  }
  const webDetail =
    platform === "web"
      ? "Continue on the computer-side installer, then return with its pairing invitation."
      : "VibePad checks the computer before installing or changing anything.";
  return (
    <OnboardingFrame back={actions.back} testID="onboarding-ssh-credentials">
      <OnboardingHeading detail={webDetail}>
        Set up a computer
      </OnboardingHeading>
      <View className="mx-auto w-full max-w-2xl gap-4">
        {platform === "web" ? (
          <View className="rounded-xl border border-border bg-card p-5">
            <Text className="text-center leading-6" variant="muted">
              Browser security routes SSH through the computer-side installer.
            </Text>
          </View>
        ) : (
          <>
            <View className="gap-3 sm:flex-row">
              <Field
                label="Name"
                onChangeText={setName}
                placeholder="My computer"
                testID="onboarding-ssh-name"
                value={name}
                widthClass="sm:flex-[1.2]"
              />
              <Field
                label="SSH host"
                onChangeText={setHost}
                placeholder="computer.local"
                testID="onboarding-ssh-host"
                value={host}
                widthClass="sm:flex-[2]"
              />
              <Field
                keyboardType="number-pad"
                label="Port"
                onChangeText={setPort}
                placeholder="22"
                testID="onboarding-ssh-port"
                value={port}
                widthClass="sm:flex-[0.65]"
              />
            </View>
            <View className="gap-3 sm:flex-row">
              <Field
                label="Username"
                onChangeText={setUsername}
                placeholder="SSH username"
                testID="onboarding-ssh-username"
                value={username}
                widthClass="sm:flex-1"
              />
              <Field
                label="Password"
                onChangeText={setPassword}
                placeholder="Password"
                testID="onboarding-ssh-password"
                value={password}
                widthClass="sm:flex-1"
              />
            </View>
          </>
        )}
        <Button
          className="h-12 rounded-xl"
          disabled={
            checking ||
            (platform !== "web" &&
              (name.trim().length === 0 ||
                host.trim().length === 0 ||
                username.trim().length === 0 ||
                password.length === 0 ||
                !Number.isInteger(Number(port))))
          }
          {...(platform === "web" ? {} : { onPress: inspect })}
          testID="onboarding-ssh-inspect"
        >
          <Text>{actionLabel}</Text>
        </Button>
        {state.errorMessage ? (
          <Text
            className="text-center text-red-600 text-sm"
            testID="onboarding-ssh-error"
          >
            {state.errorMessage}
          </Text>
        ) : null}
      </View>
    </OnboardingFrame>
  );
}

const inspectionStateLabel = (component: ComputerComponentInspection) => {
  if (component.state === "installed-ready") {
    return component.version ? `Ready · ${component.version}` : "Ready";
  }
  const labels: Record<
    Exclude<ComputerComponentInspection["state"], "installed-ready">,
    string
  > = {
    "installed-authentication-required": "Sign-in available after setup",
    "installed-update-available": "Update available",
    "missing-install-selected": "Will install",
    "missing-skip-selected": "Skipped",
    unavailable: "Unavailable",
  };
  return labels[component.state];
};

function InspectionComponentRow({
  component,
  onToggle,
}: {
  readonly component: ComputerComponentInspection;
  readonly onToggle?:
    | ((componentId: ComputerComponentInspection["id"]) => void)
    | undefined;
}) {
  const toggle = useCallback(
    () => onToggle?.(component.id),
    [component.id, onToggle]
  );
  const selectable =
    component.id !== "vibepad-host" &&
    (component.state === "missing-install-selected" ||
      component.state === "missing-skip-selected");
  return (
    <View
      className="flex-row items-center gap-3 border-border border-b px-4 py-4 last:border-b-0"
      testID={`onboarding-component-${component.id}`}
    >
      <Icon
        name={component.id === "browser-tools" ? "browser" : "laptop"}
        size={18}
      />
      <View className="min-w-0 flex-1">
        <Text className="font-medium">{componentLabel[component.id]}</Text>
        <Text className="text-sm" variant="muted">
          {inspectionStateLabel(component)}
        </Text>
      </View>
      {selectable ? (
        <Switch
          onValueChange={toggle}
          testID={`onboarding-component-toggle-${component.id}`}
          value={component.state === "missing-install-selected"}
        />
      ) : (
        <Icon className="text-success" name="check" size={16} />
      )}
    </View>
  );
}

function InspectionScreen({ actions, state }: ScreenProps) {
  const [automaticStart, setAutomaticStart] = useState(
    state.screen === "computer-inspection" ? state.automaticStart : true
  );
  const continueSetup = useCallback(
    () => actions.continueFromInspection?.(automaticStart),
    [actions, automaticStart]
  );
  if (state.screen !== "computer-inspection") {
    return null;
  }
  const providerSelected = state.report.components.some(
    (component) =>
      (component.id === "codex" || component.id === "opencode") &&
      component.state !== "missing-skip-selected" &&
      component.state !== "unavailable"
  );
  return (
    <OnboardingFrame
      back={actions.back}
      testID="onboarding-computer-inspection"
    >
      <OnboardingHeading detail="Choose the coding tools VibePad should prepare.">
        {state.report.computerName} is ready to set up
      </OnboardingHeading>
      <View className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card">
        {state.report.components.map((component) => (
          <InspectionComponentRow
            component={component}
            key={component.id}
            onToggle={actions.toggleComponent}
          />
        ))}
        {state.report.automaticStartAvailable ? (
          <View className="flex-row items-center gap-4 px-4 py-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-medium">Start Host when VibePad opens</Text>
              <Text className="text-sm leading-5" variant="muted">
                Uses a restricted device key to start this computer&apos;s Host.
              </Text>
            </View>
            <Switch
              onValueChange={setAutomaticStart}
              testID="onboarding-automatic-start"
              value={automaticStart}
            />
          </View>
        ) : null}
      </View>
      <Button
        className="mx-auto h-12 w-full max-w-2xl rounded-xl"
        disabled={!providerSelected}
        onPress={continueSetup}
        testID="onboarding-install"
      >
        <Text>Install and connect</Text>
      </Button>
    </OnboardingFrame>
  );
}

function InstallationScreen({ state }: ScreenProps) {
  if (state.screen !== "installation") {
    return null;
  }
  return (
    <OnboardingFrame testID="onboarding-installation">
      <OnboardingHeading detail="Keep VibePad open while setup finishes.">
        Setting up {state.progress.computerName}
      </OnboardingHeading>
      <View className="mx-auto w-full max-w-xl gap-1 rounded-2xl border border-border bg-card p-3">
        {state.progress.steps.map((step) => (
          <View
            className="flex-row items-center gap-3 rounded-xl px-3 py-3"
            key={step.id}
            testID={`onboarding-step-${step.id}`}
          >
            <View
              className={cn(
                "size-7 items-center justify-center rounded-full border",
                step.status === "complete" && "border-success bg-success",
                step.status === "active" && "border-primary bg-primary",
                step.status === "failed" && "border-red-600 bg-red-600"
              )}
            >
              <InstallationStepMark status={step.status} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-medium text-sm">{stepLabel[step.id]}</Text>
              {step.detail ? (
                <Text className="text-xs" variant="muted">
                  {step.detail}
                </Text>
              ) : null}
              {step.progress === undefined ? null : (
                <View className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <View
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${step.progress * 100}%` }}
                  />
                </View>
              )}
            </View>
          </View>
        ))}
      </View>
    </OnboardingFrame>
  );
}

function ReadyScreen({ actions, state }: ScreenProps) {
  if (state.screen !== "computer-ready") {
    return null;
  }
  return (
    <OnboardingFrame testID="onboarding-computer-ready">
      <View className="items-center gap-7">
        <View className="size-16 items-center justify-center rounded-full bg-success">
          <Icon color="white" name="check" size={28} />
        </View>
        <View className="items-center gap-3">
          <Text className="text-center font-semibold text-3xl tracking-tight">
            {state.computer.hostName} is connected
          </Text>
          <Text className="text-center leading-6" variant="muted">
            Your projects and chats are ready in VibePad.
          </Text>
        </View>
        <Button
          className="h-12 min-w-48 rounded-xl"
          onPress={actions.finish}
          testID="onboarding-open-vibepad"
        >
          <Text>Open VibePad</Text>
        </Button>
      </View>
    </OnboardingFrame>
  );
}

interface ScreenProps {
  readonly actions: OnboardingActions;
  readonly platform: OnboardingPlatform;
  readonly state: OnboardingState;
}

interface OnboardingScreenProps extends ScreenProps {
  readonly initialSshValues?: SshConnectionDefaults;
}

function InstallationStepMark({
  status,
}: {
  readonly status: InstallationStep["status"];
}) {
  if (status === "complete") {
    return <Icon color="white" name="check" size={13} />;
  }
  if (status === "failed") {
    return <Icon color="white" name="x" size={13} />;
  }
  return <View className="size-2 rounded-full bg-muted-foreground" />;
}

export function OnboardingScreen({
  actions = {},
  initialSshValues,
  platform,
  state,
}: OnboardingScreenProps) {
  if (state.screen === "welcome") {
    return (
      <WelcomeScreen actions={actions} platform={platform} state={state} />
    );
  }
  if (state.screen === "runtime-choice") {
    return (
      <RuntimeChoiceScreen
        actions={actions}
        platform={platform}
        state={state}
      />
    );
  }
  if (state.screen === "computer-choice") {
    return (
      <ComputerChoiceScreen
        actions={actions}
        platform={platform}
        state={state}
      />
    );
  }
  if (state.screen === "pair-existing") {
    return (
      <PairExistingScreen actions={actions} platform={platform} state={state} />
    );
  }
  if (state.screen === "ssh-credentials") {
    return (
      <SshCredentialsScreen
        actions={actions}
        {...(initialSshValues ? { initialValues: initialSshValues } : {})}
        platform={platform}
        state={state}
      />
    );
  }
  if (state.screen === "computer-inspection") {
    return (
      <InspectionScreen actions={actions} platform={platform} state={state} />
    );
  }
  if (state.screen === "installation") {
    return (
      <InstallationScreen actions={actions} platform={platform} state={state} />
    );
  }
  return <ReadyScreen actions={actions} platform={platform} state={state} />;
}
