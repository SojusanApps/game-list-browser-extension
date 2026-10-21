export const LANGUAGES = ["en", "pl"] as const;
export type Language = (typeof LANGUAGES)[number];

export const STORAGE_KEY = "popupLanguage";

export const MESSAGES: Record<Language, { title: string; description: string; switchLabel: string }> = {
  en: {
    title: "Sojusan GameList",
    description: "Open the Title Import page on GameList and use the platform buttons to fill in your games.",
    switchLabel: "Switch language to Polish",
  },
  pl: {
    title: "Sojusan GameList",
    description: "Otwórz stronę importu tytułów w GameList i użyj przycisków platform, aby uzupełnić swoje gry.",
    switchLabel: "Przełącz język na angielski",
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
