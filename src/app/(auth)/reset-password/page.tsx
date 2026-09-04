"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/icons/ArrowRightIcon";
import { AuthHero } from "@/components/auth/AuthHero";

export default function ResetPasswordPage() {
  const t = useTranslations();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

          <div className="flex flex-col gap-6">
            <h2 className="font-display text-2xl font-medium tracking-tight text-text-primary sm:text-[32px]">
              {t("common.resetPassword")}
            </h2>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-6"
              noValidate
            >
              <div className="flex flex-col gap-4">
                <InputField
                  id="new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  label={t("common.newPassword")}
                  placeholder={t("common.passwordPlaceholder")}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
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
                />
              </div>

              <Button
                type="submit"
                icon={<ArrowRightIcon className="h-5 w-5" />}
                className="w-full"
              >
                {t("common.resetYourPassword")}
              </Button>
            </form>

            <div className="flex items-center gap-2 text-base">
              <span className="text-text-secondary">
                {t("common.goBackTo")}
              </span>
              <Link
                href="/login"
                className="text-accent underline underline-offset-2"
              >
                {t("common.login")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
