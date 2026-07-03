import { ButtonStyle, ComponentType, MessageFlags } from "discord-api-types/v10";
import {
  DISCORD_APPLICATION_COMMANDS,
  DISCORD_BUTTON_TEST_ACTIONS,
  DISCORD_BUTTON_TEST_CUSTOM_ID_PREFIX,
  DISCORD_EMBED_COLORS,
} from "../constants/discord.js";
import type {
  ButtonTestAction,
  DiscordInfoResponseInput,
  DiscordInteractionResponseData,
  DiscordProfileResponseInput,
} from "../types/discord.js";

const withComponentsV2Flags = (
  data: Omit<DiscordInteractionResponseData, "flags">,
  ephemeral: boolean,
  allowedMentions = false,
): DiscordInteractionResponseData => ({
  ...data,
  flags:
    MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
  ...(allowedMentions ? { allowed_mentions: { parse: [] } } : {}),
});

const createTextDisplay = (content: string) => ({
  type: ComponentType.TextDisplay,
  content,
});

const createSeparator = () => ({
  type: ComponentType.Separator,
  divider: true,
  spacing: 1,
});

const createContainer = (
  components: NonNullable<DiscordInteractionResponseData["components"]>,
  accentColor: number = DISCORD_EMBED_COLORS.PRIMARY,
) => ({
  type: ComponentType.Container,
  accent_color: accentColor,
  components,
});

const createButtonTestCustomId = (action: ButtonTestAction): string =>
  `${DISCORD_BUTTON_TEST_CUSTOM_ID_PREFIX}:${action}`;

const createButtonTestActionRow = () => ({
  type: ComponentType.ActionRow,
  components: [
    {
      type: ComponentType.Button,
      custom_id: createButtonTestCustomId(DISCORD_BUTTON_TEST_ACTIONS.PRIMARY),
      label: "Refresh",
      style: ButtonStyle.Primary,
    },
    {
      type: ComponentType.Button,
      custom_id: createButtonTestCustomId(DISCORD_BUTTON_TEST_ACTIONS.SECONDARY),
      label: "Echo",
      style: ButtonStyle.Secondary,
    },
    {
      type: ComponentType.Button,
      custom_id: createButtonTestCustomId(DISCORD_BUTTON_TEST_ACTIONS.SUCCESS),
      label: "Success",
      style: ButtonStyle.Success,
    },
    {
      type: ComponentType.Button,
      custom_id: createButtonTestCustomId(DISCORD_BUTTON_TEST_ACTIONS.DANGER),
      label: "Danger",
      style: ButtonStyle.Danger,
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
}: DiscordInfoResponseInput): DiscordInteractionResponseData =>
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
}: DiscordProfileResponseInput): DiscordInteractionResponseData =>
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

  if (prefix !== DISCORD_BUTTON_TEST_CUSTOM_ID_PREFIX) {
    return undefined;
  }

  return Object.values(DISCORD_BUTTON_TEST_ACTIONS).includes(action as ButtonTestAction)
    ? (action as ButtonTestAction)
    : undefined;
};

export const createButtonTestClickResponseData = (action: ButtonTestAction): DiscordInteractionResponseData => {
  const clickedAt = Math.floor(Date.now() / 1000);

  switch (action) {
    case DISCORD_BUTTON_TEST_ACTIONS.PRIMARY:
      return createButtonTestResponseData(false, `Refreshed <t:${clickedAt}:R>.`);
    case DISCORD_BUTTON_TEST_ACTIONS.SECONDARY:
      return createButtonTestResponseData(false, "Echo: the secondary button was clicked.");
    case DISCORD_BUTTON_TEST_ACTIONS.SUCCESS:
      return createButtonTestResponseData(false, "Success: the green button completed its action.");
    case DISCORD_BUTTON_TEST_ACTIONS.DANGER:
      return createButtonTestResponseData(false, "Danger: the red button was clicked. Nothing destructive happened.");
  }
};
