import { useId } from 'react';

export function Field({ label, help, error, as: Tag = 'input', children, ...props }) {
  const id = useId();
  return <div className="field">
    <label htmlFor={id}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
    <Tag id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined} {...props}>{children}</Tag>
    {error ? <p className="field-error" id={`${id}-error`}>{error}</p> : help ? <p className="field-help" id={`${id}-help`}>{help}</p> : null}
  </div>;
}

export function Notice({ error, children }) {
  if (!error && !children) return null;
  return <div className={`notice ${error ? 'notice-error' : 'notice-success'}`} role={error ? 'alert' : 'status'}>{error?.message || error || children}</div>;
}

export function Submit({ busy, children, ...props }) {
  return <button className="button primary" type="submit" disabled={busy} {...props}>{busy ? 'Saving…' : children}</button>;
}

export function Loading({ children = 'Loading your workspace…' }) {
  return <div className="loading" role="status"><span className="spinner" />{children}</div>;
}

export function Brand() {
  return <a className="brand" href="/" aria-label="RosterLink home"><span className="brand-symbol" aria-hidden="true">R<span>↗</span></span><span>Roster<span className="brand-accent">Link</span></span></a>;
}
