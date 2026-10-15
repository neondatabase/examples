import { AuthView } from "@neondatabase/auth-ui";
import { authViewPaths } from "@neondatabase/auth-ui/server";

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      {/* Without `redirectTo` here, the auth UI reads an unchecked `?redirectTo=` from the URL. */}
      <AuthView path={path} redirectTo="/" />
    </main>
  );
}
