import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Field, Notice } from './components.jsx';

export default function CompetitionEntry({ game, entry, index, update, remove, errors }) {
  const [options, setOptions] = useState([]), [error, setError] = useState(null), [loading, setLoading] = useState(false), [incomplete, setIncomplete] = useState(false), [revision, setRevision] = useState(0);
  const reference = entry.competition;
  useEffect(() => {
    let current = true;
    setOptions([]); setError(null); setIncomplete(false);
    if (!reference) { setLoading(false); return; }
    setLoading(true);
    api(`/games/${game._id}/competitions/${reference.seriesId}?leagueId=${reference.leagueId}`, { timeout: 30000 }).then(data => {
      if (!current) return;
      setOptions(data.resultOptions); setIncomplete(data.incomplete);
      update(value => value.competition?.seriesId === reference.seriesId ? { ...value, competition: { ...data.competition, stageIds: [...new Set([...value.competition.stageIds, ...data.competition.stageIds])].slice(0, 100) } } : value);
    }).catch(error => { if (current) setError(error); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [game._id, reference?.gameId, reference?.leagueId, reference?.seriesId, revision]);
  const selection = entry.result ? entry.result.kind === 'manual' ? 'manual' : `${entry.result.kind}:${entry.result.value}` : entry.placement ? 'manual' : '';
  const savedOption = selection && selection !== 'manual' && !options.some(option => `${option.kind}:${option.value}` === selection);
  function metadata(key, value) { update(previous => ({ ...previous, [key]: value, competition: null, tournament: null })); }
  function result(value) {
    if (value === 'manual') update(previous => ({ ...previous, result: { kind: 'manual', value: previous.placement || '' } }));
    else if (!value) update(previous => ({ ...previous, placement: '', result: null }));
    else {
      const option = options.find(option => `${option.kind}:${option.value}` === value);
      if (option) update(previous => ({ ...previous, placement: option.label, result: { kind: option.kind, value: option.value } }));
    }
  }
  return <fieldset className="experience-entry">
    <legend>Tournament entry {index + 1}</legend>
    <p className="muted small">{entry.competition || entry.tournament ? 'Metadata source: PandaScore. Editing the competition metadata makes it manual.' : 'Manual competition metadata.'} Participation and results: self-reported.</p>
    <div className="form-grid">
      <Field label="Competition name" required maxLength={200} value={entry.name} onChange={event => metadata('name', event.target.value)} error={errors[`experience.${index}.name`]} dir="auto" />
      <Field label="Edition / year" required maxLength={80} value={entry.edition} onChange={event => metadata('edition', event.target.value)} error={errors[`experience.${index}.edition`]} dir="auto" />
      {(!entry.competition || entry.stage) && <Field label="Stage / context (optional)" maxLength={120} value={entry.stage || ''} onChange={event => metadata('stage', event.target.value)} dir="auto" />}
      <Field label="Placement / elimination stage" as="select" required value={selection} onChange={event => result(event.target.value)} help="All results are self-reported. Exact places, ranges, top cutoffs, and elimination rounds are separate claims." error={errors[`experience.${index}.placement`]}>
        <option value="">Select a result or enter one manually</option>
        {options.map(option => <option key={`${option.kind}:${option.value}`} value={`${option.kind}:${option.value}`}>{option.label}</option>)}
        {savedOption && <option value={selection}>{entry.placement} (saved result)</option>}
        <option value="manual">Other / enter result manually</option>
      </Field>
      {selection === 'manual' && <Field label="Manual result (self-reported)" required maxLength={120} value={entry.placement} onChange={event => update(previous => ({ ...previous, placement: event.target.value, result: { kind: 'manual', value: event.target.value } }))} error={errors[`experience.${index}.result.value`]} dir="auto" />}
    </div>
    {loading && <p role="status">Inspecting this edition’s stages, standings, and bracket metadata… Manual results are available now.</p>}
    <Notice error={error} />
    {(incomplete || (!loading && !options.length)) && <p className="muted small">Result metadata is unavailable or insufficient for a complete option list. Enter any result manually; this does not mean the competition lacks that result.</p>}
    {reference && <button type="button" className="text-button" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh result suggestions</button>}
    <button type="button" className="text-button danger" onClick={remove}>Delete tournament entry {index + 1}</button>
  </fieldset>;
}
