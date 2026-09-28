"use client";

import type { ReactNode } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { useTranslations } from "next-intl";

/**
 * Lazy-loaded from SubjectsMasterScreen.tsx via next/dynamic — the one
 * deliberately code-split component in this repo, because TipTap +
 * ProseMirror is the one dependency here genuinely worth keeping out of
 * the main bundle until a user actually opens the Subject form. Default
 * export specifically so next/dynamic's `import()` resolves cleanly.
 *
 * Lean toolbar only, per spec: Bold/Italic/Underline, H2/H3, bullet +
 * numbered list, alignment, link — no image/table/font-color/etc.
 */
type SubjectDescriptionEditorProps = {
  contentJson: Record<string, unknown> | null;
  onChange: (json: Record<string, unknown>, html: string) => void;
  hasError?: boolean;
  error?: string;
};

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={!!active}
      className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm font-semibold transition-colors ${
        active ? "bg-brand-tint text-accent" : "text-text-secondary hover:bg-background hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

export default function SubjectDescriptionEditor({
  contentJson,
  onChange,
  hasError,
  error,
}: SubjectDescriptionEditorProps) {
  const t = useTranslations();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: (contentJson as JSONContent | null) ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON() as Record<string, unknown>, instance.getHTML()),
    editorProps: {
      attributes: {
        class: "tiptap-content min-h-[160px] px-4 py-3 text-sm text-text-primary focus:outline-none",
      },
    },
  });

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("setup.subjectsMaster.fields.description.toolbar.linkPrompt"), previousUrl ?? "");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">
        {t("setup.subjectsMaster.fields.description.label")}
      </span>
      <div className={`overflow-hidden rounded-md border bg-surface ${hasError ? "border-error" : "border-border"}`}>
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
            label={t("setup.subjectsMaster.fields.description.toolbar.bold")}
          >
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
            label={t("setup.subjectsMaster.fields.description.toolbar.italic")}
          >
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive("underline")}
            label={t("setup.subjectsMaster.fields.description.toolbar.underline")}
          >
            <span className="underline">U</span>
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive("heading", { level: 2 })}
            label={t("setup.subjectsMaster.fields.description.toolbar.heading2")}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor?.isActive("heading", { level: 3 })}
            label={t("setup.subjectsMaster.fields.description.toolbar.heading3")}
          >
            H3
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")}
            label={t("setup.subjectsMaster.fields.description.toolbar.bulletList")}
          >
            •
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive("orderedList")}
            label={t("setup.subjectsMaster.fields.description.toolbar.orderedList")}
          >
            1.
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={() => editor?.chain().focus().setTextAlign("left").run()}
            active={editor?.isActive({ textAlign: "left" })}
            label={t("setup.subjectsMaster.fields.description.toolbar.alignLeft")}
          >
            L
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().setTextAlign("center").run()}
            active={editor?.isActive({ textAlign: "center" })}
            label={t("setup.subjectsMaster.fields.description.toolbar.alignCenter")}
          >
            C
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().setTextAlign("right").run()}
            active={editor?.isActive({ textAlign: "right" })}
            label={t("setup.subjectsMaster.fields.description.toolbar.alignRight")}
          >
            R
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            onClick={setLink}
            active={editor?.isActive("link")}
            label={t("setup.subjectsMaster.fields.description.toolbar.link")}
          >
            🔗
          </ToolbarButton>
        </div>
        <EditorContent editor={editor} />
      </div>
      {hasError && error ? <p className="text-sm text-error">{error}</p> : null}
    </div>
  );
}
