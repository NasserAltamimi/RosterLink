import { isolate, number, t } from './i18n.js';
import { useRef, useState } from 'react';
import { api } from './api.js';
import { Field, Notice, Submit } from './components.jsx';
import Experience, { LegacyDetails } from './Experience.jsx';
import LanguagePicker from './LanguagePicker.jsx';
import { useToast } from './Toasts.jsx';
import { gameFields, sharedDetails, playRegions } from '../shared/game-form.js';
import { formatGameLanguageText, fromLanguageSelection, gameLanguageLimits, parseLanguageText, toLanguageSelection, validateLanguageSelection } from '../shared/languages.js';
import { ArrowDown } from 'lucide-react';

function GameIcon({ game }) {
  const [failed, setFailed] = useState(false);
  return game.imageUrl && !failed ? <img className="game-icon" src={game.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : null;
}

function GameForm({ game, profile, section, onSaved, onRemoved }) {
  const notify = useToast();
  const [values, setValues] = useState(section?.sharedDetails || sharedDetails(section?.details));
  // This game's own communication languages; independent of the profile languages and other games.
  const [languages, setLanguages] = useState(() => toLanguageSelection(parseLanguageText(values.language)));
  const originalLanguage = section?.sharedDetails?.language || section?.details?.language || '';
  const languageInput = useRef(null);
  const originalRegion = section?.sharedDetails?.server || section?.details?.server || '';
  const [regionChoice, setRegionChoice] = useState(playRegions.includes(originalRegion) && originalRegion !== 'Other' ? originalRegion : originalRegion ? 'Other' : '');
  const [customRegion, setCustomRegion] = useState(playRegions.includes(originalRegion) && originalRegion !== 'Other' ? '' : originalRegion);
  const [experience, setExperience] = useState((section?.experience || []).map(({ name, edition, stage, placement, tournament, competition, liquipedia, result }) => ({ name, edition, stage, placement, tournament, competition, liquipedia, result })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const savedRank = section?.sharedDetails?.rank || section?.details?.rank;
  const fields = gameFields.map(field => {
    if (field.key !== 'rank' || !game.rankOptions?.length) return field;
    const options = [...game.rankOptions];
    if (savedRank && !options.includes(savedRank)) options.push(savedRank);
    return { ...field, type: 'select', options, help: <a href={game.rankSource}>{t("Publisher rank guide")}</a> };
  });
  function change(key, value) {
    setValues(previous => ({ ...previous, [key]: value }));
  }
  async function submit(event) {
    event.preventDefault(); setError(null);
    const languageProblem = validateLanguageSelection(languages, { ...gameLanguageLimits, originalText: originalLanguage });
    if (languageProblem) {
      setError({ message: 'Please check the highlighted fields.', fields: { 'details.language': languageProblem } });
      languageInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const details = sharedDetails({ ...values, language: formatGameLanguageText(fromLanguageSelection(languages), originalLanguage) });
      const result = await api(`/profiles/${profile.id}/games${section ? `/${game._id}` : ''}`, { method: section ? 'PUT' : 'POST', body: section ? { details, experience } : { gameId: game._id, details, experience } });
      // Tournament entries are saved with their game profile, so this confirmation covers them too.
      onSaved(result.section); notify(section ? 'Game profile saved.' : 'Game profile added.');
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(null);
    try { await api(`/profiles/${profile.id}/games/${game._id}`, { method: 'DELETE' }); onRemoved(game._id); notify('Game profile removed.'); }
    catch (error) { setError(error); setBusy(false); }
  }
  return <section className="card form-card" id="game-details"><div className="section-heading"><h2>{game.name}</h2><span className="badge">{t("Self-reported")}</span></div>
    <form onSubmit={submit}>
      <Notice error={error} />
      <div className="form-grid">
        {fields.map(field => field.key === 'language' ? <LanguagePicker key={field.key} label={t(field.label)} selection={languages} onChange={setLanguages} disabled={busy} focusRef={languageInput} customMaxLength={field.maxLength} help={typeof field.help === 'string' ? t(field.help) : field.help} error={error?.fields?.['details.language']} /> : <Field key={field.key} label={t(field.label)} as={field.type === 'select' ? 'select' : field.key === 'availability' ? 'textarea' : 'input'} rows={field.key === 'availability' ? 2 : undefined} required={field.required} maxLength={field.maxLength} disabled={busy} value={field.key === 'server' ? regionChoice : values[field.key] || ''} onChange={e => {
          if (field.key === 'server') { setRegionChoice(e.target.value); change('server', e.target.value === 'Other' ? customRegion : e.target.value); }
          else change(field.key, e.target.value);
        }} help={typeof field.help === 'string' ? t(field.help) : field.help} error={error?.fields?.[`details.${field.key}`]} dir="auto">
          {field.type === 'select' ? <><option value="">{field.key === 'rank' ? t("Choose a rank or leave blank") : t(field.key === 'platform' ? 'Select platform' : 'Select play region')}</option>{field.options.map(option => <option key={option} value={option}>{field.key === 'rank' ? option : t(option)}</option>)}</> : undefined}
        </Field>)}
        {regionChoice === 'Other' && <Field label={t("Custom play region")} required maxLength={80} disabled={busy} value={customRegion} onChange={e => { setCustomRegion(e.target.value); change('server', e.target.value); }} dir="auto" />}
      </div>
      <Experience game={game} entries={experience} onChange={setExperience} errors={error?.fields} disabled={busy} />
      <div className="form-actions">{section ? <a className="text-button" href="/profile">{t("View my profile")}</a> : <span className="muted small">{t("Saved to your player profile.")}</span>}<Submit busy={busy}>{section ? t("Save game section") : t("Add game section")}</Submit></div>
    </form>
    <LegacyDetails details={section?.legacyDetails} />
    {section && <div className="remove-section">{confirmRemove ? <><span>{t("Remove this game section?")}</span><button type="button" className="text-button danger" disabled={busy} onClick={remove}>{t("Yes, remove")}</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmRemove(false)}>{t("Cancel")}</button></> : <button type="button" className="text-button danger" onClick={() => setConfirmRemove(true)}>{t("Remove game section")}</button>}</div>}
  </section>;
}

export default function Games({ requestedGame, profile, games, sections, onSaved, onRemoved }) {
  const [selected, setSelected] = useState(() => games.find(game => game._id === requestedGame)?._id || sections[0]?.gameId || games.find(game => game.slug === 'rocket-league')?._id || games[0]?._id || '');
  const [query, setQuery] = useState('');
  const game = games.find(game => game._id === selected);
  const section = sections.find(section => section.gameId === selected);
  const savedGames = new Set(sections.map(item => item.gameId));
  const visibleGames = games.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(savedGames.has(b._id)) - Number(savedGames.has(a._id)) || a.name.localeCompare(b.name));
  return <div className="game-editor-layout">
    <section className="card game-picker"><div><h2>{t("Your game profiles")}</h2><p className="muted small">{t("Select a game to manage your rank and experience.")}</p></div>
      {games.length > 0 && <Field label={t("Find a game")} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search games")} />}
      {games.length ? <fieldset className="supported-games"><legend>{query ? t("Matching games") : t("Supported games")} <span className="muted">({number(visibleGames.length)})</span></legend><div className="game-options">{visibleGames.map(game => <label className={`game-option${selected === game._id ? ' selected' : ''}`} key={game._id}>
        <input type="radio" name="supported-game" value={game._id} checked={selected === game._id} onChange={() => setSelected(game._id)} />
        <GameIcon game={game} /><span>{game.name}</span>{savedGames.has(game._id) && <span className="badge">{t("Added")}</span>}
      </label>)}</div>{visibleGames.length === 0 && <p className="muted small" role="status">{t("No game matches your search.")}</p>}</fieldset> : <Notice error="The game catalog is empty. Ask the project maintainer to sync the game catalog." />}
      {game && <a className="text-button game-editor-jump" href="#game-details">{t('Go to {game} details', { game: isolate(game.name) })} <ArrowDown size={15} aria-hidden="true" /></a>}
    </section>
    {game && <GameForm key={`${game._id}-${section?.id || 'new'}`} game={game} profile={profile} section={section} onSaved={onSaved} onRemoved={onRemoved} />}
  </div>;
}
