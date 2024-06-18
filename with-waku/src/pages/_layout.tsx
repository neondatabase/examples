import "../styles.css";

import type { ReactNode } from "react";

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="font-['Nunito']">
      <main className="m-6 flex items-center *:min-h-64 *:min-w-64 lg:m-0 lg:min-h-svh lg:justify-center">
        {children}
      </main>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: "static",
  };
};
