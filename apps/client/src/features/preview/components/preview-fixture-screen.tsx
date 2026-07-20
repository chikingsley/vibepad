import { type Href, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type FixtureRoute =
  | "/design/preview-fixture"
  | "/design/preview-fixture-details";

const openFixtureRoute = (path: FixtureRoute, push: (path: Href) => void) => {
  if (Platform.OS === "web" && globalThis.location) {
    globalThis.location.assign(path);
    return;
  }
  push(path as Href);
};

function FixtureButton({
  icon,
  label,
  onPress,
  testID,
  variant = "primary",
}: {
  readonly icon?: "check" | "chevron-right" | "external-link";
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
  readonly variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      className={
        variant === "primary"
          ? "h-11 flex-row items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 active:bg-slate-800"
          : "h-11 flex-row items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 active:bg-slate-50"
      }
      onPress={onPress}
      testID={testID}
    >
      <Text
        className={
          variant === "primary"
            ? "font-semibold text-sm text-white"
            : "font-semibold text-slate-900 text-sm"
        }
      >
        {label}
      </Text>
      {icon ? (
        <Icon
          color={variant === "primary" ? "#ffffff" : "#0f172a"}
          name={icon}
          size={14}
        />
      ) : null}
    </Pressable>
  );
}

export function PreviewFixtureScreen({
  detail = false,
}: {
  readonly detail?: boolean;
}) {
  const router = useRouter();
  const [annual, setAnnual] = useState(true);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState(
    detail ? "Details route loaded" : "Ready for component selection"
  );

  const navigate = useCallback(() => {
    const path = detail
      ? "/design/preview-fixture"
      : "/design/preview-fixture-details";
    openFixtureRoute(path, (href) => router.push(href));
  }, [detail, router.push]);
  const openGoogle = useCallback(() => {
    if (Platform.OS === "web" && globalThis.open) {
      globalThis.open(
        "https://www.google.com",
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }
    Linking.openURL("https://www.google.com").catch(() => undefined);
  }, []);

  const toggleBilling = useCallback((value: boolean) => {
    setAnnual(value);
    setNotice(value ? "Annual billing selected" : "Monthly billing selected");
  }, []);
  const saveEmail = useCallback(() => {
    setNotice(
      email.trim()
        ? `Invite prepared for ${email.trim()}`
        : "Enter an email first"
    );
  }, [email]);

  return (
    <ScrollView
      className="flex-1 bg-[#f5f7fb]"
      contentContainerClassName="min-h-full px-8 py-7"
      testID="preview-fixture-page"
    >
      <View className="mx-auto w-full max-w-5xl gap-8">
        <View
          className="flex-row items-center justify-between"
          testID="fixture-header"
        >
          <View className="flex-row items-center gap-3">
            <View className="size-9 items-center justify-center rounded-xl bg-blue-600">
              <Icon color="#ffffff" name="sparkles" size={17} />
            </View>
            <View>
              <Text className="font-bold text-slate-950 text-sm">
                Canvas Lab
              </Text>
              <Text className="text-[11px] text-slate-500">
                VibePad interaction fixture
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-5">
            <Text className="font-medium text-slate-600 text-xs">
              Components
            </Text>
            <Text className="font-medium text-slate-600 text-xs">Tokens</Text>
            <View className="rounded-full bg-emerald-100 px-3 py-1.5">
              <Text className="font-semibold text-[10px] text-emerald-800">
                Interactive
              </Text>
            </View>
          </View>
        </View>

        <View
          className="overflow-hidden rounded-[28px] bg-[#dfe9ff] px-9 py-10"
          testID="fixture-hero"
        >
          <View className="max-w-2xl gap-4">
            <Text className="font-bold text-[34px] text-slate-950 leading-[40px]">
              {detail
                ? "A second route for real browser history."
                : "Point at real components, not a picture of VibePad."}
            </Text>
            <Text className="max-w-xl text-[15px] text-slate-600 leading-6">
              {detail
                ? "Use the Preview back and forward buttons to verify navigation state, then select any labeled surface."
                : "Interact can scroll and type. Select snaps to a meaningful control or region. Draw preserves freeform vector strokes."}
            </Text>
            <View className="mt-2 max-w-lg flex-row gap-3">
              <View className="min-w-0 flex-1">
                <FixtureButton
                  icon="chevron-right"
                  label={detail ? "Back to playground" : "Open details route"}
                  onPress={navigate}
                  testID="fixture-route-button"
                />
              </View>
              <View className="min-w-0 flex-1">
                <FixtureButton
                  icon="external-link"
                  label="Open Google"
                  onPress={openGoogle}
                  testID="fixture-open-google"
                  variant="secondary"
                />
              </View>
            </View>
          </View>
        </View>

        <View className="flex-row gap-5">
          <View
            className="min-w-0 flex-1 gap-5 rounded-2xl border border-slate-200 bg-white p-6"
            testID="fixture-pricing-card"
          >
            <View className="flex-row items-start justify-between gap-4">
              <View className="gap-1">
                <Text className="font-bold text-slate-950 text-xl">
                  Studio plan
                </Text>
                <Text className="text-slate-500 text-sm">
                  A selectable card boundary
                </Text>
              </View>
              <View className="rounded-full bg-blue-50 px-3 py-1.5">
                <Text className="font-semibold text-[10px] text-blue-700">
                  POPULAR
                </Text>
              </View>
            </View>
            <View className="flex-row items-end gap-1">
              <Text className="font-bold text-[34px] text-slate-950">
                {annual ? "$24" : "$30"}
              </Text>
              <Text className="mb-1 text-slate-500 text-sm">/ month</Text>
            </View>
            <View
              className="flex-row items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
              testID="fixture-billing-control"
            >
              <View>
                <Text className="font-semibold text-slate-900 text-sm">
                  Annual billing
                </Text>
                <Text className="text-[11px] text-slate-500">
                  Save 20% across the year
                </Text>
              </View>
              <Switch
                accessibilityLabel="Annual billing"
                onValueChange={toggleBilling}
                testID="fixture-billing-switch"
                value={annual}
              />
            </View>
            <View className="gap-2">
              {[
                "Unlimited review cues",
                "DOM-aware selections",
                "Vector annotations",
              ].map((feature) => (
                <View className="flex-row items-center gap-2" key={feature}>
                  <Icon color="#16a34a" name="check" size={13} />
                  <Text className="text-slate-700 text-sm">{feature}</Text>
                </View>
              ))}
            </View>
          </View>

          <View
            className="min-w-0 flex-1 gap-5 rounded-2xl border border-slate-200 bg-white p-6"
            testID="fixture-invite-card"
          >
            <View className="gap-1">
              <Text className="font-bold text-slate-950 text-xl">
                Invite a reviewer
              </Text>
              <Text className="text-slate-500 text-sm">
                Type here while Preview is in Interact mode.
              </Text>
            </View>
            <View className="gap-2">
              <Text className="font-semibold text-[11px] text-slate-700">
                Email address
              </Text>
              <TextInput
                accessibilityLabel="Reviewer email"
                autoCapitalize="none"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-slate-950 text-sm outline-none"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="reviewer@example.com"
                placeholderTextColor="#94a3b8"
                testID="fixture-email-input"
                value={email}
              />
            </View>
            <FixtureButton
              icon="chevron-right"
              label="Prepare invitation"
              onPress={saveEmail}
              testID="fixture-invite-button"
              variant="secondary"
            />
            <View
              accessibilityLiveRegion="polite"
              className="mt-auto rounded-xl bg-slate-950 px-4 py-3"
              testID="fixture-live-status"
            >
              <Text className="font-semibold text-[10px] text-slate-400">
                LAST ACTION
              </Text>
              <Text className="mt-1 text-sm text-white">{notice}</Text>
            </View>
          </View>
        </View>

        <View
          className="rounded-2xl border border-slate-300 border-dashed bg-white px-6 py-8"
          testID="fixture-drawing-zone"
        >
          <Text className="font-semibold text-slate-900 text-sm">
            Long-page drawing zone
          </Text>
          <Text className="mt-1 max-w-2xl text-slate-500 text-sm leading-6">
            Scroll here in Interact, switch to Draw, and circle the spacing or
            any component above. The cue keeps normalized coordinates and its
            timestamp.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
