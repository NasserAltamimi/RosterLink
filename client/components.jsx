import { errorText, t } from './i18n.js';
import { useId, useState } from 'react';
import { ArrowUpRight, Eye, EyeOff } from 'lucide-react';

export function Field({ label, help, error, as: Tag = 'input', children, trailing, ...props }) {
  const id = useId();
  const input = <Tag id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
    dir={props.type === 'email' || props.type === 'url' ? 'ltr' : undefined} {...props}>{children}</Tag>;
  return <div className="field">
    <label htmlFor={id}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
    {trailing ? <div className="field-with-control">{input}{trailing}</div> : input}
    {error ? <p className="field-error" id={`${id}-error`}>{errorText(error)}</p> : help ? <p className="field-help" id={`${id}-help`}>{help}</p> : null}
  </div>;
}

export function PasswordField({ label, ...props }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return <Field {...props} label={label} type={visible ? 'text' : 'password'} dir="auto" trailing={
    <button className="password-toggle" type="button" aria-label={t(visible ? 'Hide {label}' : 'Show {label}', { label: label.toLowerCase() })} onClick={() => setVisible(!visible)}>
      <Icon size={18} aria-hidden="true" />
    </button>
  } />;
}

export function Notice({ error, children }) {
  if (!error && !children) return null;
  return <div className={`notice ${error ? 'notice-error' : 'notice-success'}`} role={error ? 'alert' : 'status'}>{error ? errorText(error.message || error) : children}</div>;
}

export function Submit({ busy, children, ...props }) {
  return <button className="button primary" type="submit" disabled={busy} {...props}>{busy ? t("Saving…") : children}</button>;
}

export function Loading({ children = t('Loading your workspace…') }) {
  return <div className="loading" role="status"><span className="spinner" />{children}</div>;
}

export function Brand() {
  return <a className="brand" href="/" aria-label={t("RosterLink home")}><span className="brand-symbol" dir="ltr" aria-hidden="true">R<ArrowUpRight size={14} strokeWidth={2.7} /></span><bdi>Roster<span className="brand-accent">Link</span></bdi></a>;
}
