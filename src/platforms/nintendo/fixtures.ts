import { readFileSync } from "node:fs";

import type { GraphqlPayload } from "./parse";

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

export const wishlistPage = JSON.parse(read("wishlist-page.json")) as GraphqlPayload;
export const collectionPage = JSON.parse(read("collection-page.json")) as GraphqlPayload;
export const collectionHtml = read("collection-page.html");
export const shopHtml = read("shop-page.html");

export const CLIENT_ID_SHOP = "b".repeat(64);
export const CLIENT_ID_COLLECTION = "a".repeat(64);
export const QUERY_HASH = "c".repeat(64);
