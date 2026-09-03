"use client";

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/icons/ArrowRightIcon";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { AuthHero } from "@/components/auth/AuthHero";
import { setPassword, type SetPasswordResult } from "@/lib/auth/setPassword";
import {
  getPasswordRequirements,
  isPasswordValid,
  type PasswordRequirements,
} from "@/lib/auth/passwordValidation";

const REDIRECT_DELAY_MS = 2000;

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <SetPasswordShell>
          <LoadingState />
        </SetPasswordShell>
      }
    >
      <SetPasswordContent />
    </Suspense>
  );
}

function SetPasswordContent() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPasswordValue] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => {
      router.push("/login");
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, router]);

  const requirements = getPasswordRequirements(password);
  const passwordValid = isPasswordValid(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const submitting = status === "submitting";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    setTouched(true);
    if (!passwordValid || !passwordsMatch) return;

    setStatus("submitting");
    setErrorMessage(null);

    const result = await setPassword(token, password);

    if (result.ok) {
      setStatus("success");
      return;
    }

    setStatus("error");
    setErrorMessage(resolveErrorMessage(t, result));
  };

  return (
    <SetPasswordShell>
      {!token ? (
        <InvalidLinkState />
      ) : status === "success" ? (
        <SuccessState />
      ) : (
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-2xl font-medium tracking-tight text-text-primary sm:text-[32px]">
            {t("setPassword.title")}
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
            <div className="flex flex-col gap-4">
              <InputField
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                label={t("common.newPassword")}
                placeholder={t("common.passwordPlaceholder")}
                value={password}
                onChange={(event) => setPasswordValue(event.target.value)}
                hasError={touched && !passwordValid}
              />
              <InputField
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                label={t("common.confirmPassword")}
                placeholder={t("common.passwordPlaceholder")}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                hasError={touched && !passwordsMatch}
                error={touched && !passwordsMatch ? t("setPassword.passwordsDoNotMatch") : undefined}
              />
            </div>

            <PasswordRequirementsList requirements={requirements} />

            {status === "error" && errorMessage ? (
              <p role="alert" className="text-sm text-error">
                {errorMessage}
              </p>
            ) : null}

            <Button
              type="submit"
              icon={<ArrowRightIcon className="h-5 w-5" />}
              className="w-full"
              disabled={submitting}
            >
              {submitting ? t("setPassword.submitting") : t("setPassword.submit")}
            </Button>
          </form>
        </div>
      )}
    </SetPasswordShell>
  );
}

function resolveErrorMessage(
  t: (key: string) => string,
  result: Extract<SetPasswordResult, { ok: false }>,
): string {
  switch (result.reason) {
    case "invalid_token":
      return t("setPassword.errors.invalidToken");
    case "validation_error":
      return result.serverMessage || t("setPassword.errors.validation");
    case "network_error":
      return t("setPassword.errors.network");
    case "unknown_error":
    default:
      return t("setPassword.errors.unknown");
  }
}

function PasswordRequirementsList({ requirements }: { requirements: PasswordRequirements }) {
  const t = useTranslations();
  const items = [
    { met: requirements.minLength && requirements.maxLength, label: t("setPassword.requirements.length") },
    { met: requirements.hasUppercase, label: t("setPassword.requirements.uppercase") },
    { met: requirements.hasLowercase, label: t("setPassword.requirements.lowercase") },
    { met: requirements.hasNumber, label: t("setPassword.requirements.number") },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background px-4 py-3">
      <p className="text-sm font-medium text-text-primary">{t("setPassword.requirements.title")}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li
            key={item.label}
            className={`flex items-center gap-2 text-sm ${item.met ? "text-success" : "text-text-muted"}`}
          >
            {item.met ? (
              <CheckIcon className="h-4 w-4 shrink-0" />
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">{t("setPassword.requirements.specialNote")}</p>
    </div>
  );
}

function InvalidLinkState() {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-medium tracking-tight text-text-primary sm:text-[32px]">
        {t("setPassword.invalidLink.title")}
      </h2>
      <p className="text-base text-text-secondary">{t("setPassword.invalidLink.message")}</p>
      <Link href="/login" className="text-accent underline underline-offset-2">
        {t("setPassword.invalidLink.backToLogin")}
      </Link>
    </div>
  );
}

function SuccessState() {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-medium tracking-tight text-text-primary sm:text-[32px]">
        {t("setPassword.success.title")}
      </h2>
      <p className="text-base text-text-secondary">{t("setPassword.success.message")}</p>
    </div>
  );
}

function LoadingState() {
  const t = useTranslations();
  return <p className="text-base text-text-secondary">{t("onboarding.common.loading")}</p>;
}

function SetPasswordShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <main className="flex min-h-screen w-full flex-col lg:flex-row">
      <AuthHero
        heading={t("welcome.welcomeBack")}
        schoolName={t("welcome.schoolName")}
        tagline={t("welcome.tagline")}
      />

      <section className="flex w-full flex-1 items-center justify-center bg-surface px-6 py-10 lg:flex-[583]">
        <div className="flex w-full max-w-[446px] flex-col gap-8">
          <div className="flex h-16 w-[150px] items-center justify-center rounded-[9px] bg-white p-2.5 shadow-[2px_4px_8px_rgba(0,0,0,0.1)]">
            <Image
              src="/auth/zsms-logo.png"
              alt="ZSMS"
              width={150}
              height={64}
              className="h-full w-full object-contain"
            />
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}
