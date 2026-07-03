import {
  DISCORD_APPLICATION_COMMANDS,
  DISCORD_BUTTON_STYLES,
  DISCORD_COMPONENT_TYPES,
  DISCORD_EMBED_COLORS,
  DISCORD_MESSAGE_FLAGS,
} from "../constants/discord.js";
import type { DiscordInteractionResponseData } from "../types/discord.js";

const BUTTON_TEST_CUSTOM_ID_PREFIX = "button-test";

const BUTTON_TEST_ACTIONS = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
  SUCCESS: "success",
  DANGER: "danger",
} as const;

type ButtonTestAction = (typeof BUTTON_TEST_ACTIONS)[keyof typeof BUTTON_TEST_ACTIONS];

const withComponentsV2Flags = (
  data: Omit<DiscordInteractionResponseData, "flags">,
  ephemeral: boolean,
  allowedMentions = false,
): DiscordInteractionResponseData => ({
  ...data,
  flags:
    DISCORD_MESSAGE_FLAGS.IS_COMPONENTS_V2 | (ephemeral ? DISCORD_MESSAGE_FLAGS.EPHEMERAL : 0),
  ...(allowedMentions ? { allowed_mentions: { parse: [] } } : {}),
});

const createTextDisplay = (content: string) => ({
  type: DISCORD_COMPONENT_TYPES.TEXT_DISPLAY,
  content,
});

const createSeparator = () => ({
  type: DISCORD_COMPONENT_TYPES.SEPARATOR,
  divider: true,
  spacing: 1,
});

const createContainer = (
  components: NonNullable<DiscordInteractionResponseData["components"]>,
  accentColor: number = DISCORD_EMBED_COLORS.PRIMARY,
) => ({
  type: DISCORD_COMPONENT_TYPES.CONTAINER,
  accent_color: accentColor,
  components,
});

const createButtonTestCustomId = (action: ButtonTestAction): string => `${BUTTON_TEST_CUSTOM_ID_PREFIX}:${action}`;

const createButtonTestActionRow = () => ({
  type: DISCORD_COMPONENT_TYPES.ACTION_ROW,
  components: [
    {
      type: DISCORD_COMPONENT_TYPES.BUTTON,
      custom_id: createButtonTestCustomId(BUTTON_TEST_ACTIONS.PRIMARY),
      label: "Refresh",
      style: DISCORD_BUTTON_STYLES.PRIMARY,
    },
    {
      type: DISCORD_COMPONENT_TYPES.BUTTON,
      custom_id: createButtonTestCustomId(BUTTON_TEST_ACTIONS.SECONDARY),
      label: "Echo",
      style: DISCORD_BUTTON_STYLES.SECONDARY,
    },
    {
      type: DISCORD_COMPONENT_TYPES.BUTTON,
      custom_id: createButtonTestCustomId(BUTTON_TEST_ACTIONS.SUCCESS),
      label: "Success",
      style: DISCORD_BUTTON_STYLES.SUCCESS,
    },
    {
      type: DISCORD_COMPONENT_TYPES.BUTTON,
      custom_id: createButtonTestCustomId(BUTTON_TEST_ACTIONS.DANGER),
      label: "Danger",
      style: DISCORD_BUTTON_STYLES.DANGER,
    },
  ],
});

export const createHelpResponseData = (
  ephemeral: boolean,
  commandMentions: Record<string, string> = {},
): DiscordInteractionResponseData =>
  withComponentsV2Flags(
    {
      components: [
        createContainer(
          [
            createTextDisplay("### Neon Discord Bot Help"),
            createSeparator(),
            createTextDisplay(
              DISCORD_APPLICATION_COMMANDS.map((command) => {
                const commandLabel = commandMentions[command.name] ?? `\`/${command.name}\``;

                return `- ${commandLabel} - ${command.description}`;
              }).join("\n"),
            ),
            createSeparator(),
            createTextDisplay("Each command supports an optional `ephemeral` boolean to keep the response private."),
          ],
        ),
      ],
    },
    ephemeral,
  );

export const createInfoResponseData = ({
  branch,
  ephemeral,
  functionUrl,
  method,
  platform,
  runtime,
}: {
  branch: string;
  ephemeral: boolean;
  functionUrl: string;
  method: string;
  platform: string;
  runtime: string;
}): DiscordInteractionResponseData =>
  withComponentsV2Flags(
    {
      components: [
        createContainer([
          createTextDisplay("### Neon Discord Bot Info"),
          createSeparator(),
          createTextDisplay(
            [
              `- **Runtime:** ${runtime}`,
              `- **Platform:** ${platform}`,
              `- **Request method:** ${method}`,
              `- **Neon branch:** ${branch}`,
              `- **Function URL:** ${functionUrl}`,
            ].join("\n"),
          ),
        ]),
      ],
    },
    ephemeral,
  );

export const createProfileResponseData = ({
  ephemeral,
  name,
  totalRuns,
  usageLines,
}: {
  ephemeral: boolean;
  name: string | undefined;
  totalRuns: number;
  usageLines: string[];
}): DiscordInteractionResponseData =>
  withComponentsV2Flags(
    {
      components: [
        createContainer(
          [
            createTextDisplay("### Your Profile"),
            createSeparator(),
            createTextDisplay(
              [
                `- **Name:** ${name ? `**${name}**` : "not set"}`,
                `- **Total commands run:** ${totalRuns}`,
                "- **Storage:** Neon Postgres via Drizzle",
              ].join("\n"),
            ),
            createSeparator(),
            createTextDisplay(["**Command usage**", ...usageLines].join("\n")),
          ],
        ),
      ],
    },
    ephemeral,
    true,
  );

export const createButtonTestResponseData = (
  ephemeral: boolean,
  status = "Click a button below to test Discord component interactions.",
): DiscordInteractionResponseData =>
  withComponentsV2Flags(
    {
      components: [
        createContainer([
          createTextDisplay(["### Button Test", status].join("\n")),
          createSeparator(),
          createButtonTestActionRow(),
        ]),
      ],
    },
    ephemeral,
  );

export const parseButtonTestCustomId = (customId: string): ButtonTestAction | undefined => {
  const [prefix, action] = customId.split(":");

  if (prefix !== BUTTON_TEST_CUSTOM_ID_PREFIX) {
    return undefined;
  }

  return Object.values(BUTTON_TEST_ACTIONS).includes(action as ButtonTestAction)
    ? (action as ButtonTestAction)
    : undefined;
};

export const createButtonTestClickResponseData = (action: ButtonTestAction): DiscordInteractionResponseData => {
  const clickedAt = Math.floor(Date.now() / 1000);

  switch (action) {
    case BUTTON_TEST_ACTIONS.PRIMARY:
      return createButtonTestResponseData(false, `Refreshed <t:${clickedAt}:R>.`);
    case BUTTON_TEST_ACTIONS.SECONDARY:
      return createButtonTestResponseData(false, "Echo: the secondary button was clicked.");
    case BUTTON_TEST_ACTIONS.SUCCESS:
      return createButtonTestResponseData(false, "Success: the green button completed its action.");
    case BUTTON_TEST_ACTIONS.DANGER:
      return createButtonTestResponseData(false, "Danger: the red button was clicked. Nothing destructive happened.");
  }
};
