"use client";

// One useNotifications() for the whole app (a single Realtime channel): Home's
// "Your games", the notification bell and the app-nav badges all read the same
// data through this provider. Off on the in-game screens, where none of those
// are shown.

import { createContext, ReactNode, useContext } from "react";
import { usePathname } from "next/navigation";
import { normalizePath } from "./navVisibility";
import { Notifications, useNotifications } from "./useNotifications";

const NotificationsContext = createContext<Notifications | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const path = normalizePath(usePathname());
  const inGame = path === "/game" || path.startsWith("/multiplayer");
  const value = useNotifications(!inGame);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

const EMPTY: Notifications = {
  friendRequests: 0,
  gameRequests: 0,
  yourTurn: 0,
  total: 0,
  mpGames: [],
  loading: false,
  refresh: () => {},
};

/** The shared notification counts. Outside a provider (unit tests) it's empty. */
export function useSharedNotifications(): Notifications {
  return useContext(NotificationsContext) ?? EMPTY;
}
