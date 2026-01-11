import { useState } from "react";
import { errMsg } from "../utils/formatters";

export function useClipboard() {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedValue(text);
      setTimeout(() => setCopiedValue(null), 1200);
    } catch {
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopiedValue(text);
        setTimeout(() => setCopiedValue(null), 1200);
      } catch (e: unknown) {
        setError(errMsg(e));
      }
    }
  }

  return { copyToClipboard, copiedValue, error, setError };
}
