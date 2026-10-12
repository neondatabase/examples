export interface Todo {
  readonly id: number;
  readonly title: string;
  readonly status: "active" | "completed";
}
