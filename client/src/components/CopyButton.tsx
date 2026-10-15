import { useState } from "react";
import { useI18n } from "../context/I18nContext.js";

interface Props {
  value: string;
  className?: string;
}

/** Small inline "copy to clipboard" control for long strings (npub, nsec, addresses) that are otherwise fiddly to select on mobile. */
export function CopyButton({ value, className }: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (insecure context, denied permission); fail silently, the text is still selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={"text-[11px] font-bold text-vil-ember " + (className ?? "")}
    >
      {copied ? t("common.copied") : t("common.copy")}
    </button>
  );
}
