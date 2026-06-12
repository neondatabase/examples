import { Mastra } from '@mastra/core/mastra';
import { personalAssistant } from '../agent';

export const mastra = new Mastra({
  agents: { personalAssistant },
});
