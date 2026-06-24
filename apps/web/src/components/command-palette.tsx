"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Search as SearchIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import { allNavItems } from "../lib/navigation";
import { prefetchDataForRoute } from "../lib/query-cache";
import { useI18n } from "../i18n";

export function CommandPalette() {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    void prefetchDataForRoute(href);
    router.push(href);
  }

  function runSearch() {
    const q = query.trim();
    setOpen(false);
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("command.title")}
      description={t("command.description")}
    >
      <CommandInput
        placeholder={t("command.placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{t("command.empty")}</CommandEmpty>
        <CommandGroup heading={t("command.actions")}>
          <CommandItem onSelect={() => go("/inbox")} value="capture quick capture">
            <Inbox />
            <span>{t("shell.quickCapture")}</span>
          </CommandItem>
          {query.trim() ? (
            <CommandItem onSelect={runSearch} value={`search ${query}`}>
              <SearchIcon />
              <span>{t("command.searchFor", { query: query.trim() })}</span>
            </CommandItem>
          ) : null}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("command.navigate")}>
          {allNavItems.map((item) => (
            <CommandItem
              key={item.href}
              value={`${t(item.labelKey as never)} ${item.href}`}
              onFocus={() => {
                void prefetchDataForRoute(item.href);
              }}
              onMouseEnter={() => {
                void prefetchDataForRoute(item.href);
              }}
              onSelect={() => go(item.href)}
            >
              <item.icon />
              <span>{t(item.labelKey as never)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
