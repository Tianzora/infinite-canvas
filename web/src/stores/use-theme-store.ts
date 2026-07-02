import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";
export type ThemePreference = ThemeName | "system";

type ThemeStore = {
    theme: ThemeName;
    preference: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
    setResolvedTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            preference: "system",
            setTheme: (theme) => set((state) => ({ preference: theme, theme: theme === "system" ? state.theme : theme })),
            setResolvedTheme: (theme) => set({ theme }),
        }),
        {
            name: "infinite-canvas:theme_store",
            version: 1,
            migrate: () => ({ preference: "system" }),
        },
    ),
);
