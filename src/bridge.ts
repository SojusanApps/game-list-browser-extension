import {
  CONTRACT_VERSION,
  type ExtensionMessage,
  parseFrontendMessage,
  type Platform,
  type SyncResult,
} from "./contract";

export interface BridgeDeps {
  /** Window the frontend page posts to; replies are posted back to it. */
  window: Pick<Window, "postMessage" | "addEventListener"> & { location: { origin: string } };
  requestSync(platform: Platform): Promise<SyncResult>;
}

/** Wires the frontend page to the extension and announces the extension is present. */
export function startBridge({ window, requestSync }: BridgeDeps): void {
  const reply = (message: ExtensionMessage) => window.postMessage(message, window.location.origin);
  const ready = (): ExtensionMessage => ({ source: "gamelist-extension", version: CONTRACT_VERSION, type: "READY" });

  window.addEventListener("message", async (event: MessageEvent) => {
    // Only trust messages the page posted to itself.
    if (event.source !== (window as unknown) || event.origin !== window.location.origin) return;
    const message = parseFrontendMessage(event.data);
    if (!message) return;

    if (message.type === "PING") {
      reply(ready());
      return;
    }

    const result = await requestSync(message.platform);
    reply({
      source: "gamelist-extension",
      version: CONTRACT_VERSION,
      type: "SYNC_RESULT",
      requestId: message.requestId,
      result,
    });
  });

  reply(ready());
}
