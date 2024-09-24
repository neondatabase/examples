import { auth } from "@/auth";
import TodoList from "@/app/TodoList";
import { Pool } from "@neondatabase/serverless";

async function getTodos(userId: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query("SELECT * FROM todos WHERE user_id = $1", [
    userId,
  ]);
  await pool.end();
  return rows;
}

type Todo = {
  id: number;
  content: string;
  completed: boolean;
};

export default async function Home() {
  const session = await auth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {!session ? (
          <>
            <h1 className="text-2xl mb-4">Welcome to the Todo App</h1>
            <p className="mb-4">Please sign in to access your todos.</p>
            <a
              href="/api/auth/signin"
              className="inline-block p-2 border rounded"
            >
              Sign In
            </a>
          </>
        ) : (
          <>
            <h1 className="text-2xl mb-4">
              Welcome, {session.user?.name || session.user?.email}
            </h1>
            <TodoList
              initialTodos={await getTodos(session.user?.id as string)}
            />
            <a
              href="/api/auth/signout"
              className="inline-block mt-4 p-2 border rounded"
            >
              Sign Out
            </a>
          </>
        )}
      </div>
    </div>
  );
}
