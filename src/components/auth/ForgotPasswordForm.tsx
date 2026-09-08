"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/icons/ArrowRightIcon";
import { AuthHero } from "@/components/auth/AuthHero";
import { forgotPassword, type ForgotPasswordResult } from "@/lib/auth/forgotPassword";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ForgotPasswordFormProps = {
  schoolSlug: string;
};

export function ForgotPasswordForm({ schoolSlug }: ForgotPasswordFormProps) {
  const t = useTranslations();

  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const emailValid = EMAIL_REGEX.test(email);
  const submitting = status === "submitting";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setTouched(true);
    if (!emailValid) return;

    setStatus("submitting");
    setErrorMessage(null);

    const result = await forgotPassword(email, schoolSlug);

    if (result.ok) {
      setStatus("success");
      return;
    }

    setStatus("error");
    setErrorMessage(resolveErrorMessage(t, result));
  };

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

          {status === "success" ? (
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-2xl font-medium tracking-tight text-text-primary sm:text-[32px]">
                {t("forgotPassword.success.title")}
              </h2>
              <p className="text-base text-text-secondary">{t("forgotPassword.success.message")}</p>
              <Link href="/login" className="text-accent underline underline-offset-2">
                {t("common.login")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <h2 className="font-display text-2xl font-medium tracking-tight text-text-primary sm:text-[32px]">
                {t("common.forgotPasswordTitle")}
              </h2>

              <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
                <InputField
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  label={t("common.emailAddress")}
                  placeholder={t("common.emailAddressPlaceholder")}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  hasError={touched && !emailValid}
                  error={touched && !emailValid ? t("forgotPassword.invalidEmail") : undefined}
                />

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
                  {submitting ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
                </Button>
              </form>

              <div className="flex items-center gap-2 text-base">
                <span className="text-text-secondary">{t("common.goBackTo")}</span>
                <Link href="/login" className="text-accent underline underline-offset-2">
                  {t("common.login")}
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function resolveErrorMessage(
  t: ReturnType<typeof useTranslations>,
  result: Extract<ForgotPasswordResult, { ok: false }>,
): string {
  switch (result.reason) {
    case "rate_limited":
      return typeof result.retryAfterSeconds === "number"
        ? t("forgotPassword.errors.rateLimitedWithSeconds", { seconds: result.retryAfterSeconds })
        : t("forgotPassword.errors.rateLimited");
    case "network_error":
      return t("forgotPassword.errors.network");
    case "unknown_error":
    default:
      return t("forgotPassword.errors.unknown");
  }
}
