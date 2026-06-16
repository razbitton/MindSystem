"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { login } from "../lib/api";
import { useI18n } from "../i18n";

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
    <div className="auth-card">
      <div className="auth-brand">
        <div className="auth-icon" aria-hidden>
          <ShieldCheck size={25} />
        </div>
        <div>
          <h1>{t("auth.title")}</h1>
          <p>{t("auth.subtitle")}</p>
        </div>
      </div>

      <form className="form-grid" onSubmit={submit}>
        <div className="form-row">
          <label htmlFor="email">{t("auth.email")}</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="local@personal-context-os.test"
            required
          />
        </div>

        <div className="form-row">
          <label htmlFor="password">{t("auth.password")}</label>
          <div className="password-field">
            <LockKeyhole size={17} aria-hidden />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              required
            />
          </div>
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <button className="button primary auth-submit" type="submit" disabled={loading || !email.trim() || !password}>
          <LogIn size={17} aria-hidden />
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>

      <details className="advanced-details">
        <summary>{t("auth.deploymentNote")}</summary>
        <p className="auth-note">{t("auth.deploymentDetails")}</p>
      </details>
    </div>
  );
}

function safeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  if (next.startsWith("/login")) return "/dashboard";
  return next;
}
