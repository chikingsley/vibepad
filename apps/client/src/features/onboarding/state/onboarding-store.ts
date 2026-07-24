import { type Observable, observable } from "@legendapp/state";
import {
  type OnboardingState,
  onboardingStateSchema,
} from "@vibepad/protocol/onboarding";

export interface OnboardingStore {
  readonly reset: () => void;
  readonly setState: (state: OnboardingState) => void;
  readonly state$: Observable<OnboardingState>;
}

export const initialOnboardingState: OnboardingState = { screen: "welcome" };

export function createOnboardingStore(
  initialState: OnboardingState = initialOnboardingState
): OnboardingStore {
  const state$ = observable<OnboardingState>(
    onboardingStateSchema.parse(initialState)
  );

  return {
    reset: () => state$.set(initialOnboardingState),
    setState: (state) => state$.set(onboardingStateSchema.parse(state)),
    state$,
  };
}
