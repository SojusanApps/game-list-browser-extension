import type { AdapterRegistry } from "./adapter";
import { epicAdapter } from "./epic";
import { gogAdapter } from "./gog";
import { nintendoAdapter } from "./nintendo";
import { playstationAdapter } from "./playstation/adapter";
import { steamAdapter } from "./steam";

/** Adapters are registered here as each platform ticket lands. */
export const adapters: AdapterRegistry = {
  epic: epicAdapter,
  gog: gogAdapter,
  nintendo: nintendoAdapter,
  playstation: playstationAdapter,
  steam: steamAdapter,
};
