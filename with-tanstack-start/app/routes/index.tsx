import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import { neon } from "@neondatabase/serverless";

async function getDatabaseVersion() {
  const sql = neon(`${process.env.DATABASE_URL}`);
  const response = await sql`SELECT version()`;
  const { version } = response[0];
  return version;
}

const getCount = createServerFn({
  method: "GET",
}).handler(async () => {
  const databaseVersion = await getDatabaseVersion();
  return { databaseVersion };
});

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => await getCount(),
});

function Home() {
  const state = Route.useLoaderData();

  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center gap-16 min-h-0">
        <header className="flex flex-col items-center gap-9">
          <div className="w-[500px] max-w-[100vw] p-4">
            <img
              src="https://neon.tech/brand/neon-logo-dark-color.svg"
              alt="Neon logo"
              className="w-full"
            />
          </div>
          <p className="text-white font-semibold text-sm">
            Database version: {state.databaseVersion}
          </p>
        </header>
        <div className="max-w-[300px] w-full space-y-6 px-4">
          <nav className="rounded-3xl border p-4 border-gray-700">
            <ul className="flex flex-col gap-4">
              {resources.map(({ href, text }) => (
                <li key={href}>
                  <a
                    className="p-4 leading-normal hover:underline text-blue-500"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </main>
  );
}

const resources = [
  {
    href: "https://tanstack.com/start/latest",
    text: "TanStack Start Docs",
  },
  {
    href: "https://neon.tech/docs/introduction",
    text: "Neon Docs",
  },
];
