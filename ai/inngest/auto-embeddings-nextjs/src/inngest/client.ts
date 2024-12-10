import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "Auto Embeddings App" });

// Define event types
export type GenerateEmbeddingEvent = {
  name: "db/documents.inserted";
  data: {
    new: {
      id: number;
      title: string;
      content: string;
    };
  };
};
