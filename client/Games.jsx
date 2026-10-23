import { useState } from 'react';
import { api } from './api.js';
import { Field, Notice, Submit } from './components.jsx';

function GameForm({ game, profile, section, onSaved, onRemoved }) {
  const [values, setValues] = useState(section?.details || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inactive = (field, details) => field.notApplicableWhen?.field && field.notApplicableWhen.values.includes(details[field.notApplicableWhen.field]);
  function change(key, value) {
    const next = { ...values, [key]: value };
    for (const field of game.fields) if (inactive(field, next)) delete next[field.key];
    setValues(next); setSaved(false);
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try {
      const details = Object.fromEntries(Object.entries(values).filter(([key]) => !inactive(game.fields.find(field => field.key === key) || {}, values)));
      const result = await api(`/profiles/${profile.id}/games${section ? `/${game._id}` : ''}`, { method: section ? 'PUT' : 'POST', body: section ? { details } : { gameId: game._id, details } });
      onSaved(result.section); setSaved(true);
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(null);
    try { await api(`/profiles/${profile.id}/games/${game._id}`, { method: 'DELETE' }); onRemoved(game._id); }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <section className="card form-card"><div className="section-heading"><div><p className="eyebrow">YOUR GAME, YOUR DETAILS</p><h2>{game.name}</h2></div><span className="badge">Self-reported</span></div>
    <p className="muted">{game.description}</p>
    <form onSubmit={submit}>
      <Notice error={error} />{saved && <Notice>Game section saved.</Notice>}
      <div className="form-grid">
        {game.fields.map(field => inactive(field, values) ? null : <Field key={field.key} label={field.label} as={field.type === 'select' ? 'select' : 'input'} required={field.required} maxLength={field.maxLength} value={values[field.key] || ''} onChange={e => change(field.key, e.target.value)} help={field.help} error={error?.fields?.[field.key]} dir="auto">
          {field.type === 'select' ? <><option value="">Select {field.label.toLowerCase()}</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</> : undefined}
        </Field>)}
      </div>
      <div className="form-actions"><span className="muted small">Entered by you. No live rank verification.</span><Submit busy={busy}>{section ? 'Save game section' : 'Add game section'}</Submit></div>
    </form>
    {section && <div className="remove-section">{confirmRemove ? <><span>Remove this game section?</span><button type="button" className="text-button danger" disabled={busy} onClick={remove}>Yes, remove</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmRemove(false)}>Cancel</button></> : <button type="button" className="text-button danger" onClick={() => setConfirmRemove(true)}>Remove game section</button>}</div>}
  </section>;
}

export default function Games({ profile, games, sections, onSaved, onRemoved }) {
  const [selected, setSelected] = useState(sections[0]?.gameId || games[0]?._id || '');
  const game = games.find(game => game._id === selected);
  const section = sections.find(section => section.gameId === selected);
  return <>
    <section className="card game-picker"><div><h2>Your game profiles</h2><p className="muted">Each supported game gets its own section. Rocket League is our first pilot.</p></div>
      {games.length ? <Field label="Supported game" as="select" value={selected} onChange={e => setSelected(e.target.value)}>{games.map(game => <option key={game._id} value={game._id}>{game.name}{sections.some(section => section.gameId === game._id) ? ' · Added' : ''}</option>)}</Field> : <Notice error="The game catalog is empty. Ask the project maintainer to run npm run seed." />}
    </section>
    {game && <GameForm key={`${game._id}-${section?.id || 'new'}`} game={game} profile={profile} section={section} onSaved={onSaved} onRemoved={onRemoved} />}
  </>;
}
