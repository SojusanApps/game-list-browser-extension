import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import browser from "webextension-polyfill";

import type { BackgroundDismissRequest } from "../contract";
import { STATUS_KEY, type SyncStatusMap } from "../status";
import { describeStatus } from "./describe";
import { type Language, MESSAGES, otherLanguage, resolveLanguage, STORAGE_KEY } from "./messages";

const TONE_COLOR = { running: "#1a73e8", done: "#188038", warning: "#b06000", error: "#d93025" } as const;

/** The status of every platform, kept current while the popup is open. */
function useSyncStatus(): SyncStatusMap {
  const [statuses, setStatuses] = useState<SyncStatusMap>({});

  useEffect(() => {
    void browser.storage.session
      .get(STATUS_KEY)
      .then(stored => setStatuses((stored[STATUS_KEY] ?? {}) as SyncStatusMap))
      .catch(() => {});
    const onChanged = (changes: Record<string, browser.Storage.StorageChange>, area: string) => {
      const change = changes[STATUS_KEY];
      if (area === "session" && change) setStatuses((change.newValue ?? {}) as SyncStatusMap);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  return statuses;
}

function Popup() {
  const [language, setLanguage] = useState<Language>(() => resolveLanguage(undefined, navigator.language));
  const statuses = useSyncStatus();

  useEffect(() => {
    void browser.storage.local.get(STORAGE_KEY).then(stored => {
      setLanguage(resolveLanguage(stored[STORAGE_KEY], navigator.language));
    });
  }, []);

  const toggle = () => {
    const next = otherLanguage(language);
    setLanguage(next);
    void browser.storage.local.set({ [STORAGE_KEY]: next });
  };

  const dismiss = (platform: BackgroundDismissRequest["platform"]) =>
    void browser.runtime.sendMessage({ type: "DISMISS", platform } satisfies BackgroundDismissRequest);

  const messages = MESSAGES[language];
  const records = Object.values(statuses).sort((a, b) => a.startedAt - b.startedAt);

  return (
    <main style={{ width: "260px", padding: "12px", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "16px", margin: 0 }}>{messages.title}</h1>
        <button type="button" onClick={toggle} aria-label={messages.switchLabel} title={messages.switchLabel}>
          {language.toUpperCase()}
        </button>
      </header>
      {records.length === 0 && <p>{messages.description}</p>}
      {records.map(record => {
        const view = describeStatus(record, language);
        return (
          <section key={record.platform} style={{ margin: "12px 0", fontSize: "13px" }}>
            <strong>{view.platform}</strong>
            <output
              role={view.tone === "error" ? "alert" : undefined}
              style={{ display: "block", margin: "4px 0", color: TONE_COLOR[view.tone] }}
            >
              {view.text}
            </output>
            {view.progress !== undefined && (
              // Without a value the bar is indeterminate.
              <progress max={1} value={view.progress ?? undefined} style={{ width: "100%" }} />
            )}
            {record.state !== "running" && (
              <button type="button" onClick={() => dismiss(record.platform)}>
                {messages.dismiss}
              </button>
            )}
          </section>
        );
      })}
    </main>
  );
}

render(<Popup />, document.getElementById("app")!);
