import "./style.css";

import { createRealtimeClient } from "@neon/realtime/client";
import { RealtimeProvider } from "@neon/realtime-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { getLiveTodos } from "./api.js";

const { query, websocketUrl } = await getLiveTodos();
const realtime = createRealtimeClient({ url: websocketUrl });
const root = document.getElementById("root");

if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <RealtimeProvider client={realtime}>
      <App query={query} />
    </RealtimeProvider>
  </StrictMode>,
);

window.addEventListener("beforeunload", () => realtime.close());
