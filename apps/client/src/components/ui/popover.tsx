import * as PopoverPrimitive from "@rn-primitives/popover";
import * as React from "react";
import { Platform, StyleSheet } from "react-native";
import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens";

import { NativeOnlyAnimatedView } from "@/components/ui/native-only-animated-view";
import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const FullWindowOverlay =
  Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment;

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  portalHost,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  portalHost?: string;
}) {
  return (
    <PopoverPrimitive.Portal {...(portalHost ? { hostName: portalHost } : {})}>
      <FullWindowOverlay>
        <PopoverPrimitive.Overlay
          asChild={Platform.OS !== "web"}
          style={Platform.select({ native: StyleSheet.absoluteFill })}
        >
          <NativeOnlyAnimatedView
            as="Pressable"
            entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.reduceMotion(ReduceMotion.System)}
          >
            <TextClassContext.Provider value="text-popover-foreground">
              <PopoverPrimitive.Content
                align={align}
                className={cn(
                  "z-50 w-72 rounded-md border border-border bg-popover p-4 shadow-black/5 shadow-md outline-hidden",
                  Platform.select({
                    web: cn(
                      "fade-in-0 zoom-in-95 animate-in cursor-auto origin-(--radix-popover-content-transform-origin)",
                      props.side === "bottom" && "slide-in-from-top-2",
                      props.side === "top" && "slide-in-from-bottom-2"
                    ),
                  }),
                  className
                )}
                sideOffset={sideOffset}
                {...props}
              />
            </TextClassContext.Provider>
          </NativeOnlyAnimatedView>
        </PopoverPrimitive.Overlay>
      </FullWindowOverlay>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
