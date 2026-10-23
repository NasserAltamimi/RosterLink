import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Field, Notice } from './components.jsx';
import CompetitionEntry from './CompetitionEntry.jsx';

export function LegacyDetails({ details }) {
  if (!details || !Object.keys(details).length) return null;
  const labels = { playerName: 'In-game name / ID', playlist: 'Competitive playlist', rank: 'Rank', division: 'Division', season: 'Season / rank context', preference: 'Play preference', server: 'Server region', language: 'Communication language', availability: 'Availability' };
  return <details className="legacy-details"><summary>Previously saved details</summary><p className="muted small">Your original details are retained here. The shared form above is used for future updates.</p><dl className="game-details">{Object.entries(details).map(([key, value]) => <div key={key}><dt>{labels[key] || key}</dt><dd dir="auto">{value || 'Not entered'}</dd></div>)}</dl></details>;
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
    const { name = '', edition = '', competition = null } = metadata;
    onChange(previous => [...previous, { name, edition, placement: '', stage: '', tournament: null, competition, result: competition ? null : { kind: 'manual', value: '' } }]);
  }
  return <fieldset className="experience-editor" disabled={disabled}>
    <legend>Competitive experience (optional)</legend>
    <p className="muted small">Participation and placement are self-reported. PandaScore supplies tournament metadata only; selecting a tournament does not verify your identity, participation, or placement.</p>
    <Field label={`Search ${game.name} competitions`} type="search" maxLength={80} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} help="Type at least 2 characters. Select a competition edition first, then describe your result. Search coverage is bounded; manual entry is always available." />
    {loading && <p role="status">Searching tournaments…</p>}
    <Notice error={error} />
    {result && <div className="tournament-results" aria-label="Tournament search results">
      {!result.competitions.length && <p role="status">No matches in the provider pages searched. This does not confirm that the competition is absent; try another name, another page, or enter it manually.</p>}
      {result.competitions.map(item => <div className="tournament-result" key={item.key}><div><strong>{item.name}</strong><p className="muted small">{item.edition || 'Edition not provided — enter it after adding'}{item.association && ` · ${item.association}`}</p></div><button type="button" className="button secondary compact" disabled={entries.length >= 20} onClick={() => add(item)} aria-label={`Select ${item.name} ${item.edition}`}>Select edition</button></div>)}
      {result.incomplete && <p role="status" className="muted small">Search is incomplete or bounded to these pages. More editions may exist. {result.warnings?.join(' ')}</p>}
      <div className="search-pagination"><button type="button" className="text-button" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Previous page</button><span className="small">Page {page}</span><button type="button" className="text-button" disabled={!result.hasMore || loading} onClick={() => setPage(value => value + 1)}>Next page</button></div>
      {result.limitReached && <p className="muted small">Search limit reached. Refine your search or enter a tournament manually.</p>}
    </div>}
    <button type="button" className="button secondary compact" disabled={entries.length >= 20} onClick={() => add()}>Add tournament manually</button>
    <p className="muted small">Manual entry is always available, including competitions outside provider coverage. Up to 20 entries per game.</p>
    {errors.experience && <Notice error={errors.experience} />}
    {entries.map((entry, index) => <CompetitionEntry key={index} game={game} entry={entry} index={index} errors={errors} update={update => onChange(previous => previous.map((entry, i) => i === index ? update(entry) : entry))} remove={() => onChange(previous => previous.filter((_, i) => i !== index))} />)}
  </fieldset>;
}
