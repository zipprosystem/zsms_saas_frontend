"use client";

import { useRef, type ChangeEvent } from "react";
import Image from "next/image";
import { UploadIcon } from "@/components/icons/UploadIcon";
import { CloseIcon } from "@/components/icons/CloseIcon";

type LogoUploadProps = {
  label: string;
  helper?: string;
  uploadLabel: string;
  changeLabel: string;
  removeLabel: string;
  file: File | null;
  previewUrl: string | null;
  onChange: (file: File | null, previewUrl: string | null) => void;
};

export function LogoUpload({
  label,
  helper,
  uploadLabel,
  changeLabel,
  removeLabel,
  file,
  previewUrl,
  onChange,
}: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onChange(selected, URL.createObjectURL(selected));
  };

  const handleRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onChange(null, null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <UploadIcon className="h-6 w-6 text-text-muted" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-sm font-semibold text-accent hover:underline"
            >
              {file ? changeLabel : uploadLabel}
            </button>
            {file ? (
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center gap-1 text-sm font-semibold text-error hover:underline"
              >
                <CloseIcon className="h-3.5 w-3.5" />
                {removeLabel}
              </button>
            ) : null}
          </div>
          {helper ? <p className="text-xs text-text-muted">{helper}</p> : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelect}
      />
    </div>
  );
}
