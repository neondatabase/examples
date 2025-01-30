export function Welcome({ databaseVersion }: { databaseVersion: string }) {
  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center gap-16 min-h-0">
        <header className="flex flex-col items-center gap-9">
          <div className="w-[500px] max-w-[100vw] p-4">
            <img
              src="https://neon.tech/brand/neon-logo-dark-color.svg"
              alt="React Router"
              className="w-full"
            />
          </div>
          <p className="text-white font-semibold text-sm">
            Database version: {databaseVersion}
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
    href: "https://reactrouter.com/docs",
    text: "React Router Docs",
  },
  {
    href: "https://neon.tech/docs/introduction",
    text: "Neon Docs",
  },
];
