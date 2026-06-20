"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Disclosure — a quiet, low-key "Advanced details" expander used to tuck away
 * developer-level surfaces (raw JSON, MIME types, object keys, OpenAPI, scopes)
 * so they stay accessible to the curious without cluttering the calm default view.
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  className
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      <CollapsibleTrigger className="group inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight
          className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90 rtl:-scale-x-100 rtl:group-data-[state=open]:rotate-90"
          aria-hidden
        />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * CodeBlock — renders raw technical text in a calm, contained mono surface.
 * Used inside Disclosure so JSON/OpenAPI payloads read as tucked-away detail.
 */
export function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      className="max-h-[min(32rem,calc(100svh_-_8rem))] max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
      dir="ltr"
    >
      {children}
    </pre>
  );
}
