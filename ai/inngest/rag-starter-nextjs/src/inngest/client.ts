import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "RAG App" });

// Define event types
export type ProcessDocumentEvent = {
  name: "document/process";
  data: {
    title: string;
    content: string;
  };
};
