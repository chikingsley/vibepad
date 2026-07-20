import uiGlyphMap from "@/assets/icons/nanoicons/VibePadUI.glyphmap.json";
import providerGlyphMap from "@/assets/icons/nanoicons/VibePadProviders.glyphmap.json";
import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  createNanoIconSet,
  type IconProps as NanoIconProps,
} from "react-native-nano-icons";
import { cssInterop } from "nativewind";
import { useContext } from "react";
import { Platform, View } from "react-native";

export type IconName = keyof typeof uiGlyphMap.i;
export type ProviderIconName = keyof typeof providerGlyphMap.i;

const providerIconNames = new Set<string>(Object.keys(providerGlyphMap.i));

export const resolveProviderIconName = (id: string): ProviderIconName =>
  providerIconNames.has(id) ? (id as ProviderIconName) : "submodel";

const NanoIcon = createNanoIconSet(uiGlyphMap);
const NanoProviderIcon = createNanoIconSet(providerGlyphMap);

type InteropIconProps<Name extends string> = Omit<
  NanoIconProps<Name>,
  "name"
> & {
  readonly className?: string;
  readonly name: Name;
};

function IconImpl({ className: _className, ...props }: InteropIconProps<IconName>) {
  return <NanoIcon allowFontScaling={false} {...props} />;
}

function ProviderIconImpl({
  className: _className,
  ...props
}: InteropIconProps<ProviderIconName>) {
  return <NanoProviderIcon allowFontScaling={false} {...props} />;
}

const StyledIconImpl = cssInterop(IconImpl, {
  className: {
    nativeStyleToProp: {
      color: true,
    },
    target: "style",
  },
});

const StyledProviderIconImpl = cssInterop(ProviderIconImpl, {
  className: {
    nativeStyleToProp: {
      color: true,
    },
    target: "style",
  },
});

export function Icon({
  className,
  color,
  size = 14,
  ...props
}: InteropIconProps<IconName>) {
  const textClass = useContext(TextClassContext);
  const resolvedClassName = cn(
    color === undefined && "text-foreground",
    textClass,
    className
  );
  const colorProps = color === undefined ? {} : { color };

  if (Platform.OS === "web") {
    return (
      <View
        className={resolvedClassName}
        style={{ height: size, width: size }}
      >
        <NanoIcon
          allowFontScaling={false}
          color={color ?? "currentColor"}
          size={size}
          {...props}
        />
      </View>
    );
  }

  return (
    <StyledIconImpl
      className={resolvedClassName}
      size={size}
      {...colorProps}
      {...props}
    />
  );
}

export function ProviderIcon({
  className,
  color,
  size = 16,
  ...props
}: InteropIconProps<ProviderIconName>) {
  const colorProps = color === undefined ? {} : { color };
  const resolvedClassName = cn(
    color === undefined && "text-foreground",
    className
  );

  if (Platform.OS === "web") {
    return (
      <View
        className={resolvedClassName}
        style={{ height: size, width: size }}
      >
        <NanoProviderIcon
          allowFontScaling={false}
          color={color ?? "currentColor"}
          size={size}
          {...props}
        />
      </View>
    );
  }

  return (
    <StyledProviderIconImpl
      className={resolvedClassName}
      size={size}
      {...colorProps}
      {...props}
    />
  );
}
