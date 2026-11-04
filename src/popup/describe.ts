import { PLATFORM_NAMES } from "../errors";
import type { SyncStatusRecord } from "../status";
import type { Language } from "./messages";
import { MESSAGES } from "./messages";

export interface StatusView {
  platform: string;
  /** What the sync is doing or how it ended. */
  text: string;
  /** 0 to 1 while running with a known total, null for an indeterminate bar, undefined when there is no bar. */
  progress: number | null | undefined;
  tone: "running" | "done" | "warning" | "error";
}

/** What the popup shows for one Platform Sync's status. */
export function describeStatus(record: SyncStatusRecord, language: Language): StatusView {
  const messages = MESSAGES[language];
  const platform = PLATFORM_NAMES[record.platform];
  switch (record.state) {
    case "running": {
      const stage = messages.stages[record.stage ?? "starting"];
      // Some stages know how many items they have read but not how many there will be: show the count, not a bar.
      const hasTotal = record.total !== undefined && record.total > 0 && record.done !== undefined;
      let count = "";
      if (hasTotal) {
        count = ` ${record.done}/${record.total}`;
      } else if (record.done !== undefined) {
        count = ` ${record.done}`;
      }
      return {
        platform,
        text: `${stage}${count}`,
        progress: hasTotal ? Math.min(1, record.done! / record.total!) : null,
        tone: "running",
      };
    }
    case "done":
      return { platform, text: messages.done(record.count ?? 0), progress: undefined, tone: "done" };
    case "not_logged_in":
      return { platform, text: messages.notLoggedIn, progress: undefined, tone: "warning" };
    case "error":
      return { platform, text: record.error ?? "", progress: undefined, tone: "error" };
  }
}
