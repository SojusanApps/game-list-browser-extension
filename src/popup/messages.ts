export const LANGUAGES = ["en", "pl"] as const;
export type Language = (typeof LANGUAGES)[number];

export const STORAGE_KEY = "popupLanguage";

export interface PopupMessages {
  title: string;
  /** Shown only while no Platform Sync has left a status. */
  description: string;
  switchLabel: string;
  stages: Record<"starting" | "collection" | "wishlist" | "resolving", string>;
  notLoggedIn: string;
  /** Outcome of a finished sync, for any number of games. */
  done: (count: number) => string;
  dismiss: string;
}

export const MESSAGES: Record<Language, PopupMessages> = {
  en: {
    title: "Sojusan GameList",
    description: "Open the Title Import page on GameList and use the platform buttons to fill in your games.",
    switchLabel: "Switch language to Polish",
    stages: {
      starting: "Starting…",
      collection: "Reading your library",
      wishlist: "Reading your wishlist",
      resolving: "Identifying games",
    },
    notLoggedIn: "Not logged in. Log in to the platform in this browser, then try again.",
    done: count => `Done: ${count} ${count === 1 ? "game" : "games"} read.`,
    dismiss: "Dismiss",
  },
  pl: {
    title: "Sojusan GameList",
    description: "Otwórz stronę importu tytułów w GameList i użyj przycisków platform, aby uzupełnić swoje gry.",
    switchLabel: "Przełącz język na angielski",
    stages: {
      starting: "Rozpoczynanie…",
      collection: "Odczyt biblioteki",
      wishlist: "Odczyt listy życzeń",
      resolving: "Rozpoznawanie gier",
    },
    notLoggedIn: "Nie zalogowano. Zaloguj się do platformy w tej przeglądarce i spróbuj ponownie.",
    done: count => {
      const form = new Intl.PluralRules("pl").select(count);
      const noun = form === "one" ? "grę" : form === "few" ? "gry" : "gier";
      return `Gotowe: odczytano ${count} ${noun}.`;
    },
    dismiss: "Zamknij",
  },
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** The stored choice if valid, otherwise Polish for Polish browsers and English for everything else. */
export function resolveLanguage(stored: unknown, browserLanguage: string): Language {
  if (isLanguage(stored)) return stored;
  return browserLanguage.toLowerCase().startsWith("pl") ? "pl" : "en";
}

export function otherLanguage(language: Language): Language {
  return language === "en" ? "pl" : "en";
}
