import type { LiveQueryState, SealedLiveQuery } from "@neon/realtime";
import { useLiveQuery } from "@neon/realtime-react";
import { randomUUID } from "expo-crypto";
import { startTransition, useCallback, useOptimistic, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createTodo, deleteTodo, getLiveTodos, toggleTodo } from "./api";

export type LiveTodosQuery = Awaited<ReturnType<typeof getLiveTodos>>["query"];
type Todo = LiveTodosQuery extends SealedLiveQuery<infer Row> ? Row : never;
type OptimisticTodo = Todo & { readonly pending?: boolean };
type MutationResult = Awaited<
  ReturnType<typeof createTodo | typeof toggleTodo | typeof deleteTodo>
>;
type OptimisticAction =
  | { readonly type: "add"; readonly todo: Todo }
  | {
      readonly type: "toggle";
      readonly id: Todo["id"];
      readonly completed: boolean;
    }
  | { readonly type: "delete"; readonly id: Todo["id"] };

function applyOptimisticAction(
  todos: readonly OptimisticTodo[],
  action: OptimisticAction,
): readonly OptimisticTodo[] {
  switch (action.type) {
    case "add":
      if (todos.some((todo) => todo.id === action.todo.id)) return todos;
      return [{ ...action.todo, pending: true }, ...todos];
    case "toggle":
      return todos.map((todo) =>
        todo.id === action.id
          ? { ...todo, completed: action.completed, pending: true }
          : todo,
      );
    case "delete":
      return todos.filter((todo) => todo.id !== action.id);
  }
}

export function TodoApp({
  query,
  onRetry,
}: {
  readonly query: LiveTodosQuery;
  readonly onRetry: () => void;
}) {
  const refreshQuery = useCallback(
    async () => (await getLiveTodos()).query,
    [],
  );
  const {
    data: todos,
    status,
    error,
    utils,
  } = useLiveQuery(query, { refreshQuery });
  const [optimisticTodos, updateOptimistically] = useOptimistic<
    readonly OptimisticTodo[],
    OptimisticAction
  >(todos ?? [], applyOptimisticAction);
  const [title, setTitle] = useState("");
  const [mutationError, setMutationError] = useState<string>();

  function addTodo() {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setTitle("");
    const todo = { id: randomUUID(), title: nextTitle, completed: false };
    mutate({ type: "add", todo }, () => createTodo(todo.id, todo.title));
  }

  function mutate(
    action: OptimisticAction,
    write: () => Promise<MutationResult>,
  ) {
    setMutationError(undefined);
    startTransition(async () => {
      updateOptimistically(action);
      try {
        const result = await write();
        if (result.kind === "committed") {
          await utils.awaitTxId(result.txid, 10_000);
        }
      } catch (cause) {
        setMutationError(
          cause instanceof Error ? cause.message : "The mutation failed",
        );
      }
    });
  }

  return (
    <Page status={status}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.content}
      >
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Todo title"
            maxLength={200}
            onChangeText={setTitle}
            onSubmitEditing={addTodo}
            placeholder="What needs doing?"
            placeholderTextColor="#71807c"
            returnKeyType="done"
            style={styles.input}
            value={title}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!title.trim()}
            onPress={addTodo}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.pressed,
              !title.trim() && styles.disabled,
            ]}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        {mutationError && <ErrorCard message={mutationError} />}

        {status === "error" ? (
          <ErrorCard
            message={`Live updates stopped: ${error.message}`}
            onRetry={onRetry}
          />
        ) : todos === undefined ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#00a86b" />
            <Text style={styles.muted}>Loading todos</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={optimisticTodos}
            keyExtractor={(todo) => todo.id}
            ListEmptyComponent={
              <Text style={styles.empty}>No todos yet. Add the first one.</Text>
            }
            renderItem={({ item: todo }) => (
              <View
                accessibilityState={{ busy: todo.pending }}
                style={styles.todo}
              >
                <Pressable
                  accessibilityLabel={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: todo.completed,
                    disabled: todo.pending,
                  }}
                  disabled={todo.pending}
                  onPress={() =>
                    mutate(
                      {
                        type: "toggle",
                        id: todo.id,
                        completed: !todo.completed,
                      },
                      () => toggleTodo(todo.id, !todo.completed),
                    )
                  }
                  style={styles.todoMain}
                >
                  <View
                    style={[
                      styles.checkbox,
                      todo.completed && styles.checkboxChecked,
                    ]}
                  >
                    {todo.completed && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text
                    numberOfLines={3}
                    style={[
                      styles.todoTitle,
                      todo.completed && styles.todoTitleCompleted,
                    ]}
                  >
                    {todo.title}
                  </Text>
                  {todo.pending && (
                    <ActivityIndicator color="#00a86b" size="small" />
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel={`Delete ${todo.title}`}
                  accessibilityRole="button"
                  disabled={todo.pending}
                  onPress={() =>
                    mutate({ type: "delete", id: todo.id }, () =>
                      deleteTodo(todo.id),
                    )
                  }
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && styles.pressed,
                    todo.pending && styles.disabled,
                  ]}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </Page>
  );
}

export function ConnectionScreen({
  status,
  message,
  onRetry,
}: {
  readonly status: LiveQueryState["status"];
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <Page status={status}>
      <View style={styles.connection}>
        {status === "connecting" && <ActivityIndicator color="#00a86b" />}
        {status === "error" ? (
          <ErrorCard message={message} onRetry={onRetry} />
        ) : (
          <Text style={styles.muted}>{message}</Text>
        )}
      </View>
    </Page>
  );
}

function Page({
  status,
  children,
}: {
  readonly status: LiveQueryState["status"];
  readonly children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>NEON REALTIME</Text>
            <Text style={styles.heading}>Shared todos</Text>
          </View>
          <View style={styles.status}>
            <View
              style={[
                styles.statusDot,
                status === "live" && styles.statusDotLive,
                status === "error" && styles.statusDotError,
              ]}
            />
            <Text style={styles.statusText}>
              {status === "stale" ? "Updating" : status}
            </Text>
          </View>
        </View>
        <Text style={styles.intro}>
          Changes sync instantly with every connected browser and device.
        </Text>
        {children}
      </View>
    </SafeAreaView>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <View accessibilityRole="alert" style={styles.errorCard}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry && (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#effcf6" },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  content: { flex: 1 },
  header: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "#087a52",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  heading: {
    color: "#10251d",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1.4,
    marginTop: 4,
  },
  status: { alignItems: "center", flexDirection: "row", marginBottom: 7 },
  statusDot: {
    backgroundColor: "#9ca8a4",
    borderRadius: 4,
    height: 8,
    marginRight: 6,
    width: 8,
  },
  statusDotLive: { backgroundColor: "#00a86b" },
  statusDotError: { backgroundColor: "#d92d20" },
  statusText: {
    color: "#66756f",
    fontSize: 12,
    textTransform: "capitalize",
  },
  intro: {
    color: "#5f6f69",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    marginTop: 12,
  },
  composer: { flexDirection: "row", gap: 10 },
  input: {
    backgroundColor: "white",
    borderColor: "#c6d8d0",
    borderRadius: 14,
    borderWidth: 1,
    color: "#10251d",
    flex: 1,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 15,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: "#00e599",
    borderRadius: 14,
    justifyContent: "center",
    minWidth: 70,
    paddingHorizontal: 16,
  },
  addButtonText: { color: "#073c2a", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },
  list: { paddingBottom: 36, paddingTop: 18 },
  empty: { color: "#66756f", paddingVertical: 28, textAlign: "center" },
  todo: {
    alignItems: "center",
    borderBottomColor: "#cfe1d9",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 62,
  },
  todoMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#799187",
    borderRadius: 6,
    borderWidth: 2,
    height: 23,
    justifyContent: "center",
    width: 23,
  },
  checkboxChecked: { backgroundColor: "#00a86b", borderColor: "#00a86b" },
  checkmark: { color: "white", fontSize: 15, fontWeight: "900" },
  todoTitle: { color: "#16372b", flex: 1, fontSize: 16, lineHeight: 22 },
  todoTitleCompleted: {
    color: "#77847f",
    textDecorationLine: "line-through",
  },
  deleteButton: { paddingHorizontal: 8, paddingVertical: 14 },
  deleteText: { color: "#9f3026", fontSize: 13, fontWeight: "700" },
  loading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    paddingVertical: 36,
  },
  connection: { alignItems: "center", gap: 12, paddingTop: 44 },
  muted: { color: "#66756f", fontSize: 15 },
  errorCard: {
    alignItems: "center",
    backgroundColor: "#feeceb",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 14,
    padding: 14,
  },
  errorText: { color: "#9f2118", flex: 1, lineHeight: 20 },
  retryButton: {
    backgroundColor: "#ffd4d0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: { color: "#7d1710", fontWeight: "800" },
});
