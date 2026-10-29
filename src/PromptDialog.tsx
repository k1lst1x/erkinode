import { t as translate } from "./i18n";
import { useState } from "react";
import type { Prompt } from "./types";

export default function PromptDialog({
  prompt,
  onSubmit,
  onCancel,
}: {
  prompt: Prompt;
  onSubmit: (answers: string[]) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<string[]>(() =>
    prompt.fields.map(() => ""),
  );

  return (
    <div className="overlay auth-overlay">
      <form
        className="dialog compact"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const submittedAnswers = prompt.fields.map((_, i) => {
            const el = form.elements.namedItem(
              `prompt-${prompt.id}-${i}`,
            ) as HTMLInputElement | null;
            return el ? el.value : answers[i] || "";
          });
          onSubmit(submittedAnswers);
        }}
      >
        <h2>{prompt.title}</h2>
        <p>{prompt.description}</p>
        {prompt.fields.map((f, i) => (
          <label key={`${prompt.id}-${i}`}>
            {f.label}
            <input
              name={`prompt-${prompt.id}-${i}`}
              autoFocus={i === 0}
              autoComplete="off"
              type={f.secret ? "password" : "text"}
              value={answers[i] || ""}
              onChange={(e) => {
                const val = e.target.value;
                setAnswers((prev) => {
                  const next = [...prev];
                  next[i] = val;
                  return next;
                });
              }}
            />
          </label>
        ))}
        <footer>
          <button type="button" onClick={onCancel}>
            {translate("Cancel")}
          </button>
          <button type="submit" className="primary">
            {translate("Continue")}
          </button>
        </footer>
      </form>
    </div>
  );
}
