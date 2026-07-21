import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import type { HarnessId } from "@vibepad/protocol/provider";
import { useCallback, useMemo } from "react";
import { Modal, Platform, Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ObservableSearchField } from "@/components/ui/observable-search-field";
import { Text } from "@/components/ui/text";
import {
  HarnessIcon,
  harnessLabel,
} from "@/features/harness/components/harness-icon";
import { boundedListHeight } from "@/lib/virtualized-list-layout";

export interface NewSessionProject {
  readonly harnessId: HarnessId;
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

interface NewSessionControlProps {
  readonly disabled: boolean;
  readonly onCreate: (projectId: string) => Promise<void>;
  readonly projects: readonly NewSessionProject[];
  readonly selectedProjectId: string | undefined;
  readonly triggerVariant?: "icon" | "sidebar";
}

const projectKey = (project: NewSessionProject) => project.id;
const projectItemSize = () => 56;

interface NewSessionControlState {
  creatingProjectId: string | undefined;
  errorMessage: string | undefined;
  open: boolean;
  query: string;
}

function ProjectOption({
  creating,
  disabled,
  onCreate,
  project,
  selected,
}: {
  readonly creating: boolean;
  readonly disabled: boolean;
  readonly onCreate: (projectId: string) => Promise<void>;
  readonly project: NewSessionProject;
  readonly selected: boolean;
}) {
  const create = useCallback(() => {
    onCreate(project.id).catch(() => undefined);
  }, [onCreate, project.id]);

  return (
    <Button
      accessibilityLabel={`Create ${harnessLabel(project.harnessId)} session in ${project.name}`}
      className="h-auto min-h-14 items-start justify-start px-3 py-2.5"
      disabled={disabled}
      onPress={create}
      testID={`new-session-project-${project.id}`}
      variant="ghost"
    >
      <HarnessIcon
        accessibilityLabel={harnessLabel(project.harnessId)}
        className="mt-0.5 text-muted-foreground"
        harnessId={project.harnessId}
        size={15}
      />
      <View className="min-w-0 flex-1 items-start gap-0.5">
        <View className="w-full flex-row items-center gap-2">
          <Text
            className="min-w-0 flex-1 font-medium text-sm"
            numberOfLines={1}
          >
            {project.name}
          </Text>
          {selected ? (
            <Text className="text-muted-foreground" variant="metadata">
              Current
            </Text>
          ) : null}
        </View>
        <Text
          className="text-muted-foreground"
          numberOfLines={1}
          variant="metadata"
        >
          {creating
            ? "Creating…"
            : `${harnessLabel(project.harnessId)} · ${project.path}`}
        </Text>
      </View>
    </Button>
  );
}

function NewSessionError({
  state$,
}: {
  readonly state$: Observable<NewSessionControlState>;
}) {
  const errorMessage = useValue(state$.errorMessage);
  return errorMessage ? (
    <Text className="px-1 text-red-600 text-xs">{errorMessage}</Text>
  ) : null;
}

function NewSessionProjectResults({
  onCreate,
  projects,
  selectedProjectId,
  state$,
}: {
  readonly onCreate: (projectId: string) => Promise<void>;
  readonly projects: readonly NewSessionProject[];
  readonly selectedProjectId: string | undefined;
  readonly state$: Observable<NewSessionControlState>;
}) {
  const query = useValue(state$.query);
  const creatingProjectId = useValue(state$.creatingProjectId);
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  );
  const visibleProjects = useMemo(() => {
    const orderedProjects = selectedProject
      ? [
          selectedProject,
          ...projects.filter((project) => project.id !== selectedProject.id),
        ]
      : projects;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return orderedProjects;
    }
    return orderedProjects.filter((project) =>
      `${harnessLabel(project.harnessId)} ${project.name} ${project.path}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    );
  }, [projects, query, selectedProject]);

  const renderProject = useCallback(
    ({ item }: LegendListRenderItemProps<NewSessionProject>) => (
      <ProjectOption
        creating={creatingProjectId === item.id}
        disabled={Boolean(creatingProjectId)}
        onCreate={onCreate}
        project={item}
        selected={item.id === selectedProjectId}
      />
    ),
    [creatingProjectId, onCreate, selectedProjectId]
  );
  const emptyProjects = useMemo(
    () => (
      <Text className="px-3 py-6 text-center text-xs" variant="muted">
        No matching workspaces.
      </Text>
    ),
    []
  );
  const listHeight = boundedListHeight({
    emptyHeight: 56,
    gap: 4,
    itemSize: projectItemSize,
    items: visibleProjects,
    maxHeight: 320,
  });

  return (
    <View
      pointerEvents={creatingProjectId ? "none" : "auto"}
      style={{ height: listHeight }}
      testID="new-session-project-list"
    >
      <LegendList
        contentContainerStyle={{ gap: 4 }}
        data={visibleProjects}
        dataKey="new-session-projects"
        extraData={`${creatingProjectId ?? "idle"}:${selectedProjectId ?? "none"}`}
        getFixedItemSize={projectItemSize}
        keyExtractor={projectKey}
        ListEmptyComponent={emptyProjects}
        recycleItems
        renderItem={renderProject}
        style={{ flex: 1 }}
        {...(Platform.OS === "web"
          ? {}
          : { keyboardShouldPersistTaps: "handled" as const })}
      />
    </View>
  );
}

export function NewSessionControl({
  disabled,
  onCreate,
  projects,
  selectedProjectId,
  triggerVariant = "icon",
}: NewSessionControlProps) {
  const state$ = useObservable<NewSessionControlState>({
    creatingProjectId: undefined,
    errorMessage: undefined,
    open: false,
    query: "",
  });
  const open = useValue(state$.open);
  const close = useCallback(() => {
    if (state$.creatingProjectId.peek()) {
      return;
    }
    state$.assign({ errorMessage: undefined, open: false, query: "" });
  }, [state$]);
  const openMenu = useCallback(() => {
    state$.open.set(true);
  }, [state$]);
  const createSession = useCallback(
    async (projectId: string) => {
      if (state$.creatingProjectId.peek()) {
        return;
      }
      state$.assign({ creatingProjectId: projectId, errorMessage: undefined });
      try {
        await onCreate(projectId);
        state$.assign({ open: false, query: "" });
      } catch (error) {
        state$.errorMessage.set(
          error instanceof Error ? error.message : "Unable to create session"
        );
      } finally {
        state$.creatingProjectId.set(undefined);
      }
    },
    [onCreate, state$]
  );

  return (
    <>
      <Button
        accessibilityLabel="New chat"
        className={
          triggerVariant === "sidebar"
            ? "h-11 w-full justify-start rounded-lg px-3 sm:h-11"
            : "size-11 shrink-0 rounded-md sm:size-11"
        }
        disabled={disabled}
        onPress={openMenu}
        size={triggerVariant === "sidebar" ? "default" : "icon"}
        testID="new-session-trigger"
        variant={triggerVariant === "sidebar" ? "outline" : "ghost"}
      >
        <Icon name="plus" size={15} />
        {triggerVariant === "sidebar" ? <Text>New chat</Text> : null}
      </Button>
      <Modal
        animationType="fade"
        onRequestClose={close}
        presentationStyle="overFullScreen"
        transparent
        visible={open}
      >
        <View
          accessibilityViewIsModal
          className="flex-1 items-center justify-center px-4 py-8"
        >
          <Pressable
            accessibilityLabel="Close new session menu"
            className="absolute inset-0 bg-black/40"
            onPress={close}
            testID="new-session-backdrop"
          />
          <View
            className="w-full max-w-96 gap-3 rounded-2xl border border-border bg-popover p-4 shadow-2xl shadow-black/25"
            testID="new-session-menu"
          >
            <View className="flex-row items-start gap-3">
              <View className="min-w-0 flex-1 gap-1">
                <Text className="font-semibold text-sm">New session</Text>
                <Text className="text-muted-foreground" variant="metadata">
                  Choose the workspace and harness for this session.
                </Text>
              </View>
              <Button
                accessibilityLabel="Close new session menu"
                onPress={close}
                size="icon"
                testID="new-session-close"
                variant="ghost"
              >
                <Icon name="x" size={15} />
              </Button>
            </View>
            <ObservableSearchField
              placeholder="Search workspaces and harnesses…"
              query$={state$.query}
              testID="new-session-search"
            />
            <NewSessionProjectResults
              onCreate={createSession}
              projects={projects}
              selectedProjectId={selectedProjectId}
              state$={state$}
            />
            <NewSessionError state$={state$} />
          </View>
        </View>
      </Modal>
    </>
  );
}
