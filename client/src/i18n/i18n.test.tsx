/// <reference types="vitest" />
import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { LanguageProvider, useI18n } from "./i18n";
import type { I18nKey } from "./translations";

function TextProbe({ keyName, params }: { keyName: I18nKey; params?: Record<string, string | number> }) {
  const { t } = useI18n();
  return <span>{t(keyName, params)}</span>;
}

function SwitchToEnglish() {
  const { setLanguage } = useI18n();
  React.useEffect(() => {
    setLanguage("en");
  }, [setLanguage]);
  return null;
}

describe("i18n", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });
  afterEach(() => {
    cleanup();
  });

  it("defaults to Vietnamese when no preference is stored", async () => {
    const { getByText } = render(
      <LanguageProvider>
        <TextProbe keyName="settings.title" />
      </LanguageProvider>,
    );

    getByText("Cài đặt");
    await waitFor(() => expect(document.documentElement.lang).toBe("vi"));
  });

  it("persists language and updates document lang", async () => {
    render(
      <LanguageProvider>
        <SwitchToEnglish />
        <TextProbe keyName="settings.title" />
      </LanguageProvider>,
    );

    await waitFor(() => expect(localStorage.getItem("app.language")).toBe("en"));
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  });

  it("returns translation for current language", async () => {
    const { getByText } = render(
      <LanguageProvider>
        <SwitchToEnglish />
        <TextProbe keyName="settings.title" />
      </LanguageProvider>,
    );

    await waitFor(() => getByText("Settings"));
  });

  it("interpolates params", async () => {
    const { getByText } = render(
      <LanguageProvider>
        <TextProbe keyName="settings.cleanup.success" params={{ count: 12, mb: 34 }} />
      </LanguageProvider>,
    );

    await waitFor(() => getByText("Đã xóa 12 tệp, giải phóng 34 MB"));
  });

  it("leaves missing params intact", async () => {
    const { getByText } = render(
      <LanguageProvider>
        <TextProbe keyName="settings.cleanup.success" params={{ count: 1 }} />
      </LanguageProvider>,
    );

    await waitFor(() => getByText("Đã xóa 1 tệp, giải phóng {{mb}} MB"));
  });

  it("throws if useI18n is used without provider", () => {
    function NoProvider() {
      useI18n();
      return null;
    }

    expect(() => render(<NoProvider />)).toThrow("useI18n must be used within LanguageProvider");
  });
});
