import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type SharedProps = {
  id: string;
  label: string;
  description?: string;
  error?: string;
  currentLength?: number;
  maxLength?: number;
  optional?: boolean;
};

type InputFieldProps = SharedProps & InputHTMLAttributes<HTMLInputElement> & { multiline?: false };
type TextareaFieldProps = SharedProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true };

export type FormFieldProps = InputFieldProps | TextareaFieldProps;

export function FormField(props: FormFieldProps) {
  const { id, label, description, error, currentLength, maxLength, optional = false, multiline, ...controlProps } = props;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const shared = {
    id,
    className: "bomti-field__control",
    "aria-describedby": describedBy,
    "aria-invalid": error ? (true as const) : undefined
  };

  return (
    <div className="bomti-field">
      <div className="bomti-field__label-row">
        <label className="bomti-field__label" htmlFor={id}>{label}</label>
        <span className="bomti-field__requirement">{optional ? "선택" : "필수"}</span>
      </div>
      {description ? <span className="bomti-field__description" id={descriptionId}>{description}</span> : null}
      {multiline ? (
        <textarea {...(controlProps as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...shared} />
      ) : (
        <input {...(controlProps as InputHTMLAttributes<HTMLInputElement>)} {...shared} />
      )}
      <div className="bomti-field__meta">
        {error ? <p className="bomti-field__error" id={errorId}>오류: {error}</p> : <span />}
        {typeof maxLength === "number" ? (
          <span className="bomti-field__counter" aria-live="polite">{currentLength ?? 0} / {maxLength}자</span>
        ) : null}
      </div>
    </div>
  );
}
