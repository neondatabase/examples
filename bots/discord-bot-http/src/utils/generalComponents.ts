import {
  DISCORD_APPLICATION_COMMANDS,
  DISCORD_BUTTON_STYLES,
  DISCORD_COMPONENT_TYPES,
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
): DiscordInteractionResponseData => ({
  ...data,
  flags:
    DISCORD_MESSAGE_FLAGS.IS_COMPONENTS_V2 | (ephemeral ? DISCORD_MESSAGE_FLAGS.EPHEMERAL : 0),
});

const createTextDisplay = (content: string) => ({
  type: DISCORD_COMPONENT_TYPES.TEXT_DISPLAY,
  content,
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

export const createHelpResponseData = (ephemeral: boolean): DiscordInteractionResponseData =>
  withComponentsV2Flags(
    {
      components: [
        createTextDisplay(
          [
            "### Neon Discord Bot Help",
            ...DISCORD_APPLICATION_COMMANDS.map((command) => `- \`/${command.name}\` - ${command.description}`),
            "",
            "Each command supports an optional `ephemeral` boolean to keep the response private.",
          ].join("\n"),
        ),
      ],
    },
    ephemeral,
  );

export const createButtonTestResponseData = (
  ephemeral: boolean,
  status = "Click a button below to test Discord component interactions.",
): DiscordInteractionResponseData =>
  withComponentsV2Flags(
    {
      components: [
        createTextDisplay(["### Button Test", status].join("\n")),
        createButtonTestActionRow(),
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
  const clickedAt = new Date().toISOString();

  switch (action) {
    case BUTTON_TEST_ACTIONS.PRIMARY:
      return createButtonTestResponseData(false, `Refreshed at \`${clickedAt}\`.`);
    case BUTTON_TEST_ACTIONS.SECONDARY:
      return createButtonTestResponseData(false, "Echo: the secondary button was clicked.");
    case BUTTON_TEST_ACTIONS.SUCCESS:
      return createButtonTestResponseData(false, "Success: the green button completed its action.");
    case BUTTON_TEST_ACTIONS.DANGER:
      return createButtonTestResponseData(false, "Danger: the red button was clicked. Nothing destructive happened.");
  }
};
