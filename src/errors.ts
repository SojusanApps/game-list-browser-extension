import type { Platform } from "./contract";
import type { Language } from "./popup/messages";

/** The request of a Platform Sync that failed, so the message can say which one. */
export type RequestStep = "authCode" | "token" | "library" | "offers" | "wishlist" | "collection" | "product";

interface ErrorParams {
  unsupportedPlatform: { platform: Platform };
  missingStoreId: { platform: Platform; field: string };
  requestFailed: { platform: Platform; step?: RequestStep; status: number; detail?: string };
  invalidResponse: { platform: Platform; step: RequestStep; status: number };
  unexpectedResponse: { platform: Platform; field: string };
  dataNotFound: { platform: Platform; step: RequestStep };
  tooManyPages: { platform: Platform; step: RequestStep };
  epicWishlistUnavailable: Record<never, never>;
  nintendoConfigNotFound: Record<never, never>;
  nintendoCountryMissing: { step: "wishlist" | "collection" };
  nintendoCollectionRejected: { fields: string; detail: string };
  nintendoPageUnreadable: Record<never, never>;
  unexpected: { detail: string };
}

export type ErrorCode = keyof ErrorParams;

type Catalog = { [K in ErrorCode]: (params: ErrorParams[K]) => string };

const PLATFORM_NAMES: Record<Platform, string> = {
  steam: "Steam",
  epic: "Epic",
  playstation: "PlayStation",
  nintendo: "Nintendo",
  gog: "GOG",
};

const STEP_NAMES: Record<Language, Record<RequestStep, string>> = {
  en: {
    authCode: "auth code",
    token: "token exchange",
    library: "library",
    offers: "offers",
    wishlist: "wishlist",
    collection: "collection",
    product: "product",
  },
  pl: {
    authCode: "kod autoryzacji",
    token: "wymiana tokenu",
    library: "biblioteka",
    offers: "oferty",
    wishlist: "lista życzeń",
    collection: "kolekcja",
    product: "produkt",
  },
};

const withDetail = (message: string, detail?: string) => (detail ? `${message}: ${detail}` : message);

const CATALOG: Record<Language, Catalog> = {
  en: {
    unsupportedPlatform: ({ platform }) => `${PLATFORM_NAMES[platform]} is not supported yet`,
    missingStoreId: ({ platform, field }) =>
      `${PLATFORM_NAMES[platform]} library has games but none with a store id (${field}); the platform response may have changed`,
    requestFailed: ({ platform, step, status, detail }) => {
      const stepLabel = step ? ` ${STEP_NAMES.en[step]}` : "";
      return withDetail(`${PLATFORM_NAMES[platform]}${stepLabel} request failed (HTTP ${status})`, detail);
    },
    invalidResponse: ({ platform, step, status }) =>
      `${PLATFORM_NAMES[platform]} ${STEP_NAMES.en[step]} request returned invalid JSON (HTTP ${status})`,
    unexpectedResponse: ({ platform, field }) => `${PLATFORM_NAMES[platform]}: ${field} is missing in response`,
    dataNotFound: ({ platform, step }) => `${PLATFORM_NAMES[platform]} ${STEP_NAMES.en[step]} data not found in page`,
    tooManyPages: ({ platform, step }) => `${PLATFORM_NAMES[platform]} ${STEP_NAMES.en[step]} has too many pages`,
    epicWishlistUnavailable: () =>
      "Epic wishlist unavailable: open https://store.epicgames.com/wishlist while logged in, then retry",
    nintendoConfigNotFound: () => "Could not discover the Nintendo wishlist configuration",
    nintendoCountryMissing: ({ step }) =>
      `Nintendo session is missing the country required for the ${STEP_NAMES.en[step]} request`,
    nintendoCollectionRejected: ({ fields, detail }) =>
      `Nintendo rejected the collection query for every id field tried (${fields}): ${detail}`,
    nintendoPageUnreadable: () => "Could not read the Nintendo collection page",
    unexpected: ({ detail }) => `Unexpected error: ${detail}`,
  },
  pl: {
    unsupportedPlatform: ({ platform }) => `${PLATFORM_NAMES[platform]} nie jest jeszcze obsługiwany`,
    missingStoreId: ({ platform, field }) =>
      `Biblioteka ${PLATFORM_NAMES[platform]} zawiera gry, ale żadna nie ma identyfikatora sklepu (${field}); odpowiedź platformy mogła się zmienić`,
    requestFailed: ({ platform, step, status, detail }) => {
      const stepLabel = step ? ` (${STEP_NAMES.pl[step]})` : "";
      return withDetail(`Żądanie do ${PLATFORM_NAMES[platform]}${stepLabel} nie powiodło się (HTTP ${status})`, detail);
    },
    invalidResponse: ({ platform, step, status }) =>
      `Odpowiedź ${PLATFORM_NAMES[platform]} (${STEP_NAMES.pl[step]}) nie jest poprawnym JSON-em (HTTP ${status})`,
    unexpectedResponse: ({ platform, field }) => `${PLATFORM_NAMES[platform]}: w odpowiedzi brakuje pola ${field}`,
    dataNotFound: ({ platform, step }) =>
      `Nie znaleziono danych (${STEP_NAMES.pl[step]}) ${PLATFORM_NAMES[platform]} na stronie`,
    tooManyPages: ({ platform, step }) => `${PLATFORM_NAMES[platform]}: zbyt wiele stron (${STEP_NAMES.pl[step]})`,
    epicWishlistUnavailable: () =>
      "Lista życzeń Epic jest niedostępna: otwórz https://store.epicgames.com/wishlist będąc zalogowanym, a następnie spróbuj ponownie",
    nintendoConfigNotFound: () => "Nie udało się wykryć konfiguracji listy życzeń Nintendo",
    nintendoCountryMissing: ({ step }) =>
      `W sesji Nintendo brakuje kraju wymaganego do pobrania danych (${STEP_NAMES.pl[step]})`,
    nintendoCollectionRejected: ({ fields, detail }) =>
      `Nintendo odrzuciło zapytanie o kolekcję dla każdego wypróbowanego pola identyfikatora (${fields}): ${detail}`,
    nintendoPageUnreadable: () => "Nie udało się odczytać strony kolekcji Nintendo",
    unexpected: ({ detail }) => `Nieoczekiwany błąd: ${detail}`,
  },
};

/** Renders an error in the given language. */
export function formatError<K extends ErrorCode>(language: Language, code: K, params: ErrorParams[K]): string {
  return (CATALOG[language][code] as (params: ErrorParams[K]) => string)(params);
}

/**
 * An error whose message is shown to the user, so it is kept as a code plus parameters and only rendered in the
 * chosen language when the Platform Sync result is built. `message` is the English rendering, for logs and tests.
 */
export class SyncError<K extends ErrorCode = ErrorCode> extends Error {
  constructor(
    readonly code: K,
    readonly params: ErrorParams[K],
  ) {
    super(formatError("en", code, params));
    this.name = "SyncError";
  }

  format(language: Language): string {
    return formatError(language, this.code, this.params);
  }
}

/** The user-facing message of any error thrown during a Platform Sync. */
export function describeError(error: unknown, language: Language): string {
  if (error instanceof SyncError) return error.format(language);
  return formatError(language, "unexpected", { detail: thrownDetail(error) });
}

/** Readable text for anything thrown; plain `String(value)` would give "[object Object]" for objects. */
function thrownDetail(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.message;
  if (typeof thrown === "string") return thrown;
  try {
    return JSON.stringify(thrown) ?? "unknown";
  } catch {
    return "unknown";
  }
}
