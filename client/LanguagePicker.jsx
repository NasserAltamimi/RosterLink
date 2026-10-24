import { useId } from 'react';
import { OTHER_LANGUAGE, standardLanguages } from '../shared/languages.js';

// One multi-select used for the general profile languages (SF-04) and every game's
// communication languages (SF-06). The parent owns the selection { selected, other, custom }
// so each form keeps its own, independently saved value.
export default function LanguagePicker({ label, selection, onChange, error, help, required = true, disabled, customMaxLength, focusRef }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  const toggle = language => onChange({ ...selection, selected: selection.selected.includes(language) ? selection.selected.filter(item => item !== language) : [...selection.selected, language] });
  const option = (key, text, checked, onToggle, ref) => <label className={`language-option${checked ? ' selected' : ''}`} key={key}>
    <input ref={ref} type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} aria-invalid={Boolean(error)} />
    <span dir="auto">{text}</span>
  </label>;
  return <fieldset className="field language-picker" aria-describedby={describedBy} disabled={disabled}>
    <legend>{label}{required && <span aria-hidden="true"> *</span>}</legend>
    <div className="language-options">
      {standardLanguages.map((language, index) => option(language, language, selection.selected.includes(language), () => toggle(language), index === 0 ? focusRef : undefined))}
      {option(OTHER_LANGUAGE, OTHER_LANGUAGE, selection.other, () => onChange({ ...selection, other: !selection.other }))}
    </div>
    {selection.other && <div className="language-custom">
      <label htmlFor={`${id}-custom`}>Other language(s)<span aria-hidden="true"> *</span></label>
      <input id={`${id}-custom`} type="text" required maxLength={customMaxLength} value={selection.custom} onChange={event => onChange({ ...selection, custom: event.target.value })} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={`${id}-custom-help`} dir="auto" placeholder="e.g. French" autoComplete="off" />
      <p className="field-help" id={`${id}-custom-help`}>Separate more than one language with commas.</p>
    </div>}
    {error ? <p className="field-error" id={`${id}-error`}>{error}</p> : help ? <p className="field-help" id={`${id}-help`}>{help}</p> : null}
  </fieldset>;
}
