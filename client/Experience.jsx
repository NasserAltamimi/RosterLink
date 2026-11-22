import { isolate, number, t } from './i18n.js';
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Field, Notice } from './components.jsx';
import CompetitionEntry from './CompetitionEntry.jsx';
import LiquipediaPicker from './LiquipediaExperience.jsx';

export function LegacyDetails({ details }) {
  if (!details || !Object.keys(details).length) return null;
  const labels = { playerName: 'In-game name / ID', playlist: 'Competitive playlist', rank: 'Rank', division: 'Division', season: 'Season / rank context', preference: 'Play preference', server: 'Server region', language: 'Communication language', availability: 'Availability' };
  return <details className="legacy-details"><summary>{t("Previously saved details")}</summary><p className="muted small">{t("Your original details are retained here. The shared form above is used for future updates.")}</p><dl className="game-details">{Object.entries(details).map(([key, value]) => <div key={key}><dt>{labels[key] ? t(labels[key]) : key}</dt><dd dir="auto">{value || t("Not entered")}</dd></div>)}</dl></details>;
}

export default function Experience({ game, entries, onChange, errors = {}, disabled }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setResult(null); setError(null);
    if (query.trim().length < 2) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/games/${game._id}/tournaments?${new URLSearchParams({ q: query.trim(), page: String(page) })}`);
        if (current) setResult(data);
      } catch (error) { if (current) setError(error); }
      finally { if (current) setLoading(false); }
    }, 400);
    return () => { current = false; clearTimeout(timer); };
  }, [game._id, query, page]);
  function add(metadata = {}) {
    const { name = '', edition = '', competition = null, liquipedia } = metadata;
    onChange(previous => [...previous, { name, edition, placement: '', stage: '', tournament: null, competition, liquipedia, result: competition ? null : { kind: 'manual', value: '' } }]);
  }
  return <fieldset className="experience-editor" disabled={disabled}>
    <legend>{t("Competitive experience (optional)")}</legend>
    <p className="muted small">{t("Choose a tournament or enter one manually. Your participation and placement are self-reported.")}</p>
    <LiquipediaPicker game={game} select={add} full={entries.length >= 20} />
    {game.providerId && <details className="legacy-details"><summary>{t("PandaScore competition lookup")}</summary>
    <Field label={t('Search {game} competitions', { game: isolate(game.name) })} type="search" maxLength={80} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} help={t("Type at least 2 characters. Select a competition edition first, then describe your result. Search coverage is bounded; manual entry is always available.")} />
    {loading && <p role="status">{t("Searching tournaments…")}</p>}
    <Notice error={error} />
    {result && <div className="tournament-results" aria-label={t("Tournament search results")}>
      {!result.competitions.length && <p role="status">{t("No matches in the provider pages searched. This does not confirm that the competition is absent; try another name, another page, or enter it manually.")}</p>}
      {result.competitions.map(item => <div className="tournament-result" key={item.key}><div><strong>{item.name}</strong><p className="muted small">{item.edition || t("Edition not provided — enter it after adding")}{item.association && ` · ${t(item.association)}`}</p></div><button type="button" className="button secondary compact" disabled={entries.length >= 20} onClick={() => add(item)} aria-label={t('Select {name} {edition}', { name: isolate(item.name), edition: isolate(item.edition) })}>{t("Select edition")}</button></div>)}
      {result.incomplete && <p role="status" className="muted small">{t("Search is incomplete or bounded to these pages. More editions may exist.") + ' '}{result.warnings?.map(warning => t(warning)).join(' ')}</p>}
      <div className="search-pagination"><button type="button" className="text-button" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>{t("Previous page")}</button><span className="small">{t('Page {number}', { number: number(page) })}</span><button type="button" className="text-button" disabled={!result.hasMore || loading} onClick={() => setPage(value => value + 1)}>{t("Next page")}</button></div>
      {result.limitReached && <p className="muted small">{t("Search limit reached. Refine your search or enter a tournament manually.")}</p>}
    </div>}</details>}
    <button type="button" className="button secondary compact" disabled={entries.length >= 20} onClick={() => add()}>{t("Add tournament manually")}</button>
    <p className="muted small">{t("Manual entry is always available, including competitions outside provider coverage. Up to 20 entries per game.")}</p>
    {errors.experience && <Notice error={errors.experience} />}
    {entries.map((entry, index) => <CompetitionEntry key={index} game={game} entry={entry} index={index} errors={errors} update={update => onChange(previous => previous.map((entry, i) => i === index ? update(entry) : entry))} remove={() => onChange(previous => previous.filter((_, i) => i !== index))} />)}
  </fieldset>;
}
