import { Mastra } from '@mastra/core/mastra';
import { Observability, MastraPlatformExporter } from '@mastra/observability';
import { moderator } from './agents/moderator';

// Ship agent traces to Mastra Cloud (Studio). Only wire observability once both
// creds are present (Observability requires >=1 exporter), so the app runs fine
// locally / before the project exists. Injected via neon.ts `env`.
const platformReady = Boolean(
  process.env.MASTRA_PLATFORM_ACCESS_TOKEN && process.env.MASTRA_PROJECT_ID,
);

const observability = platformReady
  ? new Observability({
      configs: {
        default: {
          serviceName: 'realtime-chat',
          exporters: [new MastraPlatformExporter()],
        },
      },
    })
  : undefined;

export const mastra = new Mastra({
  agents: { moderator },
  ...(observability ? { observability } : {}),
});
