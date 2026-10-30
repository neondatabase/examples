// From guides/reactivity.md "useLiveQuery"
import { useEffect, useState } from "react";

export function LocalTime({ date }: { date: Date }) {
  const [formatted, setFormatted] = useState<string>();
  useEffect(() => setFormatted(date.toLocaleTimeString()), [date]);

  return <time dateTime={date.toISOString()}>{formatted}</time>;
}
