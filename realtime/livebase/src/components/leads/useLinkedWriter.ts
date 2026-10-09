import { useEffect, useRef } from "react";

import type { Company, Person, WriterKind } from "~/db/schema";

// The writer a lead's person or company flashes with. Linking a record is a
// write to the lead, not to the record, and the record's last writer may be
// someone else: extraction may link an existing company a user last edited,
// and enrichment's domain-conflict re-point moves the lead onto another
// company without writing it. So in the render where the link changes,
// the lead's writer stands in for the record's.
export function useLinkedWriter(
  record: Person | Company | undefined,
  leadWriter: WriterKind,
): WriterKind | undefined {
  const id = record?.id;
  const linkedId = useRef(id);
  useEffect(() => {
    linkedId.current = id;
  }, [id]);
  return linkedId.current === id ? record?.updatedBy : leadWriter;
}
