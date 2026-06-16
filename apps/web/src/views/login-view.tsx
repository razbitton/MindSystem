"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, LogIn, Mail } from "lucide-react";
import { login } from "../lib/api";
import { useI18n } from "../i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginView() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email.trim(), password);
      router.replace(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div
          className="mb-1 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <span className="text-lg font-semibold">M</span>
        </div>
        <CardTitle className="text-xl">{t("auth.title")}</CardTitle>
        <CardDescription>{t("auth.subtitle")}</CardDescription>
      </CardHeader>

      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <div className="relative">
              <Mail
                size={16}
                aria-hidden
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="ps-9"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <div className="relative">
              <LockKeyhole
                size={16}
                aria-hidden
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                className="ps-9"
                required
              />
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !email.trim() || !password}
          >
            <LogIn data-icon="inline-start" />
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function safeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  if (next.startsWith("/login")) return "/dashboard";
  return next;
}
