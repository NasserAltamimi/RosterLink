import { useState } from 'react';
import { api } from './api.js';
import { Field, Notice, Submit } from './components.jsx';
import Experience, { LegacyDetails } from './Experience.jsx';
import { gameFields, sharedDetails, playRegions } from '../shared/game-form.js';

function GameIcon({ game }) {
  const [failed, setFailed] = useState(false);
  return game.imageUrl && !failed ? <img className="game-icon" src={game.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : null;
}

function GameForm({ game, profile, section, onSaved, onRemoved }) {
  const [values, setValues] = useState(section?.sharedDetails || sharedDetails(section?.details));
  const originalRegion = section?.sharedDetails?.server || section?.details?.server || '';
  const [regionChoice, setRegionChoice] = useState(playRegions.includes(originalRegion) && originalRegion !== 'Other' ? originalRegion : originalRegion ? 'Other' : '');
  const [customRegion, setCustomRegion] = useState(playRegions.includes(originalRegion) && originalRegion !== 'Other' ? '' : originalRegion);
  const [experience, setExperience] = useState((section?.experience || []).map(({ name, edition, stage, placement, tournament, competition, result }) => ({ name, edition, stage, placement, tournament, competition, result })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  function change(key, value) {
    setValues(previous => ({ ...previous, [key]: value })); setSaved(false);
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try {
      const details = sharedDetails(values);
      const result = await api(`/profiles/${profile.id}/games${section ? `/${game._id}` : ''}`, { method: section ? 'PUT' : 'POST', body: section ? { details, experience } : { gameId: game._id, details, experience } });
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
    <p className="muted">Add your platform, play region, communication languages, and availability.</p>
    <form onSubmit={submit}>
      <Notice error={error} />{saved && <Notice>Game section saved.</Notice>}
      <div className="form-grid">
        {gameFields.map(field => <Field key={field.key} label={field.label} as={field.type === 'select' ? 'select' : 'input'} required={field.required} maxLength={field.maxLength} disabled={busy} value={field.key === 'server' ? regionChoice : values[field.key] || ''} onChange={e => {
          if (field.key === 'server') { setRegionChoice(e.target.value); change('server', e.target.value === 'Other' ? customRegion : e.target.value); }
          else change(field.key, e.target.value);
        }} help={field.help} error={error?.fields?.[`details.${field.key}`]} dir="auto">
          {field.type === 'select' ? <><option value="">Select {field.label.toLowerCase()}</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</> : undefined}
        </Field>)}
        {regionChoice === 'Other' && <Field label="Custom play region" required maxLength={80} disabled={busy} value={customRegion} onChange={e => { setCustomRegion(e.target.value); change('server', e.target.value); }} dir="auto" />}
      </div>
      <Experience game={game} entries={experience} onChange={value => { setExperience(value); setSaved(false); }} errors={error?.fields} disabled={busy} />
      <div className="form-actions"><span className="muted small">Entered by you. No live rank verification.</span><Submit busy={busy}>{section ? 'Save game section' : 'Add game section'}</Submit></div>
    </form>
    <LegacyDetails details={section?.legacyDetails} />
    {section && <div className="remove-section">{confirmRemove ? <><span>Remove this game section?</span><button type="button" className="text-button danger" disabled={busy} onClick={remove}>Yes, remove</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmRemove(false)}>Cancel</button></> : <button type="button" className="text-button danger" onClick={() => setConfirmRemove(true)}>Remove game section</button>}</div>}
  </section>;
}

export default function Games({ profile, games, sections, onSaved, onRemoved }) {
  const [selected, setSelected] = useState(sections[0]?.gameId || games[0]?._id || '');
  const game = games.find(game => game._id === selected);
  const section = sections.find(section => section.gameId === selected);
  return <>
    <section className="card game-picker"><div><h2>Your game profiles</h2><p className="muted">Choose a game to add your experience and availability.</p></div>
      {games.length ? <fieldset className="supported-games"><legend>Supported game <span className="muted">({games.length})</span></legend><div className="game-options">{games.map(game => <label className={`game-option${selected === game._id ? ' selected' : ''}`} key={game._id}>
        <input type="radio" name="supported-game" value={game._id} checked={selected === game._id} onChange={() => setSelected(game._id)} />
        <GameIcon game={game} /><span>{game.name}</span>{sections.some(section => section.gameId === game._id) && <span className="badge">Added</span>}
      </label>)}</div></fieldset> : <Notice error="The game catalog is empty. Ask the project maintainer to sync the game catalog." />}
    </section>
    {game && <GameForm key={`${game._id}-${section?.id || 'new'}`} game={game} profile={profile} section={section} onSaved={onSaved} onRemoved={onRemoved} />}
  </>;
}
