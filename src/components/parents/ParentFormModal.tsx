"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { SelectField } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/ui/Toast";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { looksDeliverableEmail } from "@/lib/parents/parentLinks";
import { createParent, parentToWriteBody, parentsQueryKeyRoot, updateParent } from "@/lib/parents/parentsApi";
import {
  PARENT_ADDRESS_KEYS,
  PARENT_RELATIONSHIPS,
  PARENT_STATUSES,
  emptyParentAddress,
  type Parent,
  type ParentAddressKey,
  type ParentWriteBody,
} from "@/lib/parents/parentTypes";
import { useParentChildren, useStudentOptions } from "@/components/parents/useParentData";

function emptyForm(): ParentWriteBody {
  return {
    relationship: "parent",
    full_name: "",
    email: null,
    phone: null,
    occupation: null,
    date_of_birth: null,
    wedding_anniversary: null,
    present_address: emptyParentAddress(),
    other_address: emptyParentAddress(),
    username: null,
    status: "active",
    student_ids: [],
  };
}

function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{title}</h3>
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

type FieldErrors = Partial<Record<string, string>>;

type ParentFormModalProps = {
  /** Absent -> Add Parent. Present -> Edit (the FULL record, re-fetched — never a list row). */
  parent?: Parent;
  onClose: () => void;
  onSaved: (parent: Parent) => void;
  /** EMAIL_TAKEN: close and search the list for the parent who already has this email (dedupe). */
  onFindExisting: (email: string) => void;
};

/**
 * Add / Edit Parent — ONE page (spec v1.1 §4 collapses the Figma 3-step
 * wizard): Parent Details · Children · Address (present + other) · Login.
 * Edit sends the COMPLETE form; student_ids REPLACES the links.
 *
 * Not here (no backend yet, spec §3 later phase): password / activate-login
 * toggle / send login details. email_active is server-derived and only
 * previewed.
 */
export function ParentFormModal({ parent, onClose, onSaved, onFindExisting }: ParentFormModalProps) {
  const t = useTranslations();
  const p = useTranslations("parents");
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!parent;
  const [form, setForm] = useState<ParentWriteBody>(() => (parent ? parentToWriteBody(parent) : emptyForm()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [emailTaken, setEmailTaken] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pickId, setPickId] = useState("");
  const students = useStudentOptions();
  const children = useParentChildren(form.student_ids);

  const set = <K extends keyof ParentWriteBody>(key: K, value: ParentWriteBody[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (key === "email") setEmailTaken(null);
  };
  const setAddress = (which: "present_address" | "other_address", key: ParentAddressKey, value: string) =>
    setForm((current) => ({ ...current, [which]: { ...current[which], [key]: value || null } }));

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!form.full_name.trim()) next.full_name = p("form.errors.fullNameRequired");
    if (isEdit && !form.username?.trim()) next.username = p("form.errors.usernameRequired");
    if (form.username && /\s/.test(form.username.trim())) next.username = p("form.errors.usernameSpaces");
    return next;
  };

  const handleSubmit = async () => {
    const found = validate();
    setErrors(found);
    setBanner(null);
    if (Object.values(found).some(Boolean)) return;
    setIsSaving(true);
    const result = parent ? await updateParent(parent.id, form) : await createParent(form);
    setIsSaving(false);
    if (!result.ok) {
      if (result.kind === "validation") {
        const next: FieldErrors = {};
        for (const error of result.errors) next[error.field] = error.message ?? p("form.errors.invalid");
        setErrors(next);
        if (result.errors.some((error) => error.code === "EMAIL_TAKEN")) setEmailTaken(form.email?.trim() ?? null);
        return;
      }
      setBanner(resultErrorMessage(result, t));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: parentsQueryKeyRoot });
    showToast(p(isEdit ? "toast.updated" : "toast.created"));
    onSaved(result.data);
  };

  const addChild = (id: string) => {
    if (!id || form.student_ids.includes(id)) return;
    set("student_ids", [...form.student_ids, id]);
    setPickId("");
  };

  const pickOptions = students.options
    .filter((option) => !form.student_ids.includes(option.id))
    .map((option) => ({ value: option.id, label: option.student_no ? `${option.full_name} · ${option.student_no}` : option.full_name }));

  const emailValue = form.email?.trim() ?? "";
  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-3">
      <Button variant="secondary" onClick={onClose} disabled={isSaving}>
        {t("common.cancel")}
      </Button>
      <Button onClick={() => void handleSubmit()} disabled={isSaving}>
        {isSaving ? t("common.saving") : p(isEdit ? "form.saveChanges" : "form.create")}
      </Button>
    </div>
  );

  return (
    <WideModal isOpen onClose={onClose} title={p(isEdit ? "form.editTitle" : "form.addTitle")} subtitle={p("form.subtitle")} footer={footer}>
      <div className="flex min-w-0 flex-col gap-6">
        {banner ? <p className="rounded-lg border border-error px-4 py-3 text-sm text-error">{banner}</p> : null}

        <FormSection title={p("form.sections.details")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              id="parent-relationship"
              label={p("fields.relationship")}
              value={form.relationship}
              onChange={(event) => set("relationship", event.target.value === "guardian" ? "guardian" : "parent")}
            >
              {PARENT_RELATIONSHIPS.map((value) => (
                <option key={value} value={value}>
                  {p(`relationship.${value}`)}
                </option>
              ))}
            </SelectField>
            <InputField
              id="parent-full-name"
              label={p("fields.fullName")}
              value={form.full_name}
              onChange={(event) => set("full_name", event.target.value)}
              hasError={!!errors.full_name}
              error={errors.full_name}
              maxLength={320}
            />
            <div className="flex flex-col gap-1">
              <InputField
                id="parent-email"
                type="email"
                label={p("fields.email")}
                value={form.email ?? ""}
                onChange={(event) => set("email", event.target.value || null)}
                hasError={!!errors.email}
                error={errors.email}
                maxLength={255}
              />
              {emailTaken ? (
                <button
                  type="button"
                  onClick={() => onFindExisting(emailTaken)}
                  className="self-start text-xs font-semibold text-accent hover:underline"
                >
                  {p("form.findExisting")}
                </button>
              ) : emailValue ? (
                <p className="text-xs text-text-muted">
                  {looksDeliverableEmail(emailValue) ? p("form.emailHintMailable") : p("form.emailHintNotMailable")}
                </p>
              ) : (
                <p className="text-xs text-text-muted">{p("form.emailHintEmpty")}</p>
              )}
            </div>
            <InputField
              id="parent-phone"
              type="tel"
              label={p("fields.phone")}
              value={form.phone ?? ""}
              onChange={(event) => set("phone", event.target.value || null)}
              hasError={!!errors.phone}
              error={errors.phone}
              maxLength={50}
            />
            <InputField
              id="parent-occupation"
              label={p("fields.occupation")}
              value={form.occupation ?? ""}
              onChange={(event) => set("occupation", event.target.value || null)}
              hasError={!!errors.occupation}
              error={errors.occupation}
              maxLength={150}
            />
            <SelectField
              id="parent-status"
              label={p("fields.status")}
              value={form.status}
              onChange={(event) => set("status", event.target.value === "inactive" ? "inactive" : "active")}
            >
              {PARENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {p(`status.${value}`)}
                </option>
              ))}
            </SelectField>
            <DateField
              id="parent-dob"
              label={p("fields.dateOfBirth")}
              value={form.date_of_birth ?? ""}
              onChange={(event) => set("date_of_birth", event.target.value || null)}
              hasError={!!errors.date_of_birth}
              error={errors.date_of_birth}
            />
            <DateField
              id="parent-anniversary"
              label={p("fields.weddingAnniversary")}
              value={form.wedding_anniversary ?? ""}
              onChange={(event) => set("wedding_anniversary", event.target.value || null)}
              hasError={!!errors.wedding_anniversary}
              error={errors.wedding_anniversary}
            />
          </div>
        </FormSection>

        <FormSection title={p("form.sections.children")} hint={p("form.childrenHint")}>
          {children.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {children.map((lookup) => (
                <li
                  key={lookup.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-full bg-category-blue-tint py-1 pl-3 pr-1 text-xs font-medium text-category-blue"
                >
                  <span className="truncate">{lookup.isLoading ? p("loading") : (lookup.child?.full_name ?? p("children.unavailable"))}</span>
                  <button
                    type="button"
                    onClick={() => set("student_ids", form.student_ids.filter((id) => id !== lookup.id))}
                    aria-label={p("form.removeChild", { name: lookup.child?.full_name ?? "" })}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-surface"
                  >
                    <span aria-hidden>×</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">{p("children.noneLinked")}</p>
          )}
          {errors.student_ids ? <p className="text-xs text-error">{errors.student_ids}</p> : null}
          <SearchableSelect
            id="parent-add-child"
            label={p("link.label")}
            placeholder={p("link.placeholder")}
            options={pickOptions}
            value={pickId}
            onChange={addChild}
            onQueryChange={students.setTyped}
            loading={students.isFetching && pickOptions.length === 0}
            loadingLabel={p("loading")}
            noOptionsLabel={students.failed ? p("link.searchFailed") : students.search ? p("link.noMatches") : p("link.typeToSearch")}
          />
        </FormSection>

        {(["present_address", "other_address"] as const).map((which) => (
          <FormSection key={which} title={p(which === "present_address" ? "form.sections.presentAddress" : "form.sections.otherAddress")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {PARENT_ADDRESS_KEYS.map((key) => (
                <div key={key} className={key === "address" ? "sm:col-span-3" : undefined}>
                  <InputField
                    id={`parent-${which}-${key}`}
                    label={p(`fields.address.${key}`)}
                    value={form[which][key] ?? ""}
                    onChange={(event) => setAddress(which, key, event.target.value)}
                    maxLength={key === "address" ? 500 : 150}
                  />
                </div>
              ))}
            </div>
          </FormSection>
        ))}

        <FormSection title={p("form.sections.login")} hint={p("form.loginHint")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              id="parent-username"
              label={p("fields.username")}
              placeholder={isEdit ? undefined : p("form.usernamePlaceholder")}
              value={form.username ?? ""}
              onChange={(event) => set("username", event.target.value || null)}
              hasError={!!errors.username}
              error={errors.username}
              maxLength={100}
              autoComplete="off"
            />
          </div>
        </FormSection>
      </div>
    </WideModal>
  );
}
