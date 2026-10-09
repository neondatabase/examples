import { useSyncExternalStore } from "react";

// Nothing to listen to: the value only differs between the server snapshot and
// the client one.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// False on the server and while hydrating, true afterwards. React hydrates with
// the server snapshot and then re-renders once with the client one, so
// browser-only values (locale, time zone, clock) can render without a
// hydration mismatch.
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
