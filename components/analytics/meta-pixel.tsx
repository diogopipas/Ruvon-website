"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCart } from "@/components/providers";

const pixelId = "1319849436755354";
const consentKey = "jola_meta_pixel_consent";
const consentEvent = "jola:meta-consent";
const preferencesEvent = "jola:meta-preferences";
type Choice = "accepted" | "rejected" | null;
type FacebookPixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: (...args: unknown[]) => void;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: FacebookPixel;
    _fbq?: FacebookPixel;
  }
}

let memoryChoice: Choice = null;

function readChoice(): Choice {
  try {
    const saved = window.localStorage.getItem(consentKey);
    if (saved === "accepted" || saved === "rejected") return saved;
  } catch {
    // Keep the decision for this tab if browser storage is unavailable.
  }
  return memoryChoice;
}

function subscribe(callback: () => void) {
  window.addEventListener(consentEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(consentEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

function saveChoice(choice: Exclude<Choice, null>) {
  memoryChoice = choice;
  try {
    window.localStorage.setItem(consentKey, choice);
  } catch {
    // A decision still applies for the current tab.
  }
  window.dispatchEvent(new Event(consentEvent));
}

/** Load Meta's supplied bootstrap only after advertising consent. */
function metaPixel() {
  if (window.fbq) return window.fbq;
  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  }) as FacebookPixel;
  fbq.queue = [];
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  window.fbq = window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("init", pixelId);
  return fbq;
}

export function MetaPixel() {
  const pathname = usePathname();
  const { ageConfirmed } = useCart();
  const choice = useSyncExternalStore(subscribe, readChoice, () => null);
  const [editing, setEditing] = useState(false);
  const trackedPath = useRef<string | null>(null);
  const privatePage =
    pathname.startsWith("/admin") ||
    pathname === "/privacidade" ||
    pathname === "/termos";

  useEffect(() => {
    const open = () => setEditing(true);
    window.addEventListener(preferencesEvent, open);
    return () => window.removeEventListener(preferencesEvent, open);
  }, []);

  useEffect(() => {
    if (choice !== "accepted" || !ageConfirmed || privatePage) return;
    if (trackedPath.current === pathname) return;
    trackedPath.current = pathname;
    metaPixel()("track", "PageView");
  }, [ageConfirmed, choice, pathname, privatePage]);

  const visible =
    !pathname.startsWith("/admin") &&
    (ageConfirmed || pathname === "/privacidade" || pathname === "/termos") &&
    (choice === null || editing);
  if (!visible) return null;

  const decide = (next: Exclude<Choice, null>) => {
    const needsReload = choice === "accepted" && next === "rejected";
    saveChoice(next);
    setEditing(false);
    if (next === "rejected") {
      for (const name of ["_fbp", "_fbc"]) {
        document.cookie = `${name}=; Max-Age=0; Path=/`;
        document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${window.location.hostname}`;
      }
    }
    // A reload removes an already loaded Pixel after consent is withdrawn.
    if (needsReload) window.location.reload();
  };

  return (
    <aside className="meta-consent" aria-label="Preferências de publicidade">
      <p>
        Usamos o Meta Pixel para medir visitas de campanhas, apenas se
        autorizares. Podes mudar a escolha na{" "}
        <Link href="/privacidade">página de privacidade</Link>.
      </p>
      <div>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => decide("rejected")}
        >
          Recusar
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => decide("accepted")}
        >
          Aceitar
        </button>
      </div>
    </aside>
  );
}

export function MetaPixelPreferencesButton() {
  return (
    <button
      type="button"
      className="inline-button privacy-preferences"
      onClick={() => window.dispatchEvent(new Event(preferencesEvent))}
    >
      Alterar preferência de publicidade
    </button>
  );
}
