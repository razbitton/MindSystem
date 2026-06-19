"use client";

import { useState } from "react";
import { PageHeader } from "../components/page";
import { useI18n } from "../i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AgentsView from "./agents-view";
import DataManagementView from "./data-management-view";
import SchemasView from "./schemas-view";

export default function SettingsView({ initialTab = "preferences" }: { initialTab?: string }) {
  const { t, locale, setLocale, theme, setTheme } = useI18n();
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList>
          <TabsTrigger value="preferences">{t("settings.preferences")}</TabsTrigger>
          <TabsTrigger value="connections">{t("settings.connections")}</TabsTrigger>
          <TabsTrigger value="data">{t("settings.dataModel")}</TabsTrigger>
        </TabsList>

        <TabsContent value="preferences" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.appearance")}</CardTitle>
              <CardDescription>{t("settings.appearanceHelp")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={theme} onValueChange={(value) => setTheme(value as "light" | "dark")}>
                <TabsList>
                  <TabsTrigger value="light">{t("theme.light")}</TabsTrigger>
                  <TabsTrigger value="dark">{t("theme.dark")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("language.label")}</CardTitle>
              <CardDescription>{t("settings.languageHelp")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={locale} onValueChange={(value) => setLocale(value as "en" | "he")}>
                <TabsList>
                  <TabsTrigger value="en">{t("language.en")}</TabsTrigger>
                  <TabsTrigger value="he">{t("language.he")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections">
          <AgentsView embedded />
        </TabsContent>

        <TabsContent value="data" className="flex flex-col gap-6">
          <DataManagementView />
          <SchemasView embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
