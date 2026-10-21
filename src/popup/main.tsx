import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import browser from "webextension-polyfill";

import { type Language, MESSAGES, otherLanguage, resolveLanguage, STORAGE_KEY } from "./messages";

function Popup() {
  const [language, setLanguage] = useState<Language>(() => resolveLanguage(undefined, navigator.language));

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

  const messages = MESSAGES[language];

  return (
    <main style={{ width: "260px", padding: "12px", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "16px", margin: 0 }}>{messages.title}</h1>
        <button type="button" onClick={toggle} aria-label={messages.switchLabel} title={messages.switchLabel}>
          {language.toUpperCase()}
        </button>
      </header>
      <p>{messages.description}</p>
    </main>
  );
}

render(<Popup />, document.getElementById("app")!);
