"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types/cutout";

/**
 * localStorage-backed settings for Cutout. We persist ONLY theme preference
 * and terms-acceptance. No images, no analytics, no telemetry — privacy is
 * the core product value.
 */

const STORAGE_KEY = "cutout:settings:v1";

function readSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
      termsAccepted: parsed.termsAccepted ?? false,
      termsAcceptedAt: parsed.termsAcceptedAt ?? null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Sync from localStorage after mount to avoid SSR hydration mismatch
    // (window is undefined during server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(readSettings());
    setHydrated(true);
  }, []);

  const update = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        writeSettings(next);
        return next;
      });
    },
    [],
  );

  const acceptTerms = useCallback(() => {
    update({ termsAccepted: true, termsAcceptedAt: new Date().toISOString() });
  }, [update]);

  const resetTerms = useCallback(() => {
    update({ termsAccepted: false, termsAcceptedAt: null });
  }, [update]);

  return { settings, hydrated, update, acceptTerms, resetTerms };
}
