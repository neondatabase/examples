import { viewPaths } from "@better-auth-ui/core";
import { Auth } from "@/components/auth/auth";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(viewPaths.auth).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Auth path={path} />
    </main>
  );
}
