import { isolate, number, t } from './i18n.js';
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Field, Notice } from './components.jsx';
import { ArrowUpRight, Trophy } from 'lucide-react';
import { featuredGames } from './presentation.js';

function TournamentList({ game }) {
  const [state, setState] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!game.liquipediaWiki) return;
    let current = true;
    api(`/tournaments/${game._id}`).then(data => {
      if (current) setState({ data });
    }).catch(error => {
      if (current) setState({ error });
    });
    return () => { current = false; };
  }, [game._id, game.liquipediaWiki, attempt]);

  const { data, error } = state;
  if (!game.liquipediaWiki || data?.status === 'unsupported') return <p role="status">{t('Liquipedia tournament coverage is unavailable for {game}.', { game: isolate(game.name) })}</p>;
  if (error) return <><Notice error={error} /><button type="button" className="button secondary compact" onClick={() => { setState({}); setAttempt(value => value + 1); }}>{t("Retry")}</button></>;
  if (!data) return <p role="status">{t("Loading tournaments…")}</p>;
  if (data.status === 'unavailable') return <p role="status">{t('Liquipedia tournaments are temporarily unavailable.')}</p>;
  const shown = data.tournaments.filter(event => event.name.toLowerCase().includes(query.trim().toLowerCase()));

  return <>
    {data.stale && <p role="status">{t("Showing cached tournaments while Liquipedia is unavailable.")}</p>}
    {!data.tournaments.length && <p role="status">{t('No tournaments returned for {game}.', { game: isolate(game.name) })}</p>}
    {data.tournaments.length > 0 && <><div className="tournament-list-toolbar"><Field label={t("Filter tournament names")} type="search" value={query} onChange={event => setQuery(event.target.value)} /><p className="muted small" role="status">{t('{shown} of {total} listings', { shown: number(shown.length), total: number(data.tournaments.length) })}</p></div><ul className="tournament-results">
      {shown.map(event => <li className="tournament-result tournament-feed-row" key={event.id}>
        <span className="destination-icon"><Trophy size={18} aria-hidden="true" /></span>
        <div><strong dir="auto">{event.name}</strong><p className="muted small">
          {[event.startDate, event.endDate === event.startDate ? null : event.endDate].filter(Boolean).join(' – ') || t("Date to be announced")}
          {event.status && <> · <bdi>{event.status}</bdi></>}
        </p></div>
        {event.url && <a className="text-button" href={event.url} aria-label={t('View {name} on Liquipedia', { name: isolate(event.name) })}>Liquipedia <ArrowUpRight size={15} aria-hidden="true" /></a>}
      </li>)}
    </ul>{shown.length === 0 && <div className="empty-state"><h3>{t("No matching tournaments")}</h3><p className="muted">{t("Try another name or view all listings for this game.")}</p><button className="button secondary" onClick={() => setQuery('')}>{t("Clear search")}</button></div>}</>}
  </>;
}

export default function Tournaments() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    let current = true;
    api('/games').then(({ games }) => {
      if (!current) return;
      setCatalog([...games].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected((games.find(game => game.slug === 'rocket-league') || games[0])?._id || '');
    }).catch(error => { if (current) setError(error); });
    return () => { current = false; };
  }, []);
  const game = catalog?.find(game => game._id === selected);
  const quickGames = featuredGames(catalog || []);

  return <>
    <div className="directory-heading discovery-heading"><span className="destination-icon"><Trophy size={24} aria-hidden="true" /></span><div><h1>{t("Tournaments")}</h1><p className="muted">{t("Find competitive events in the games you follow.")}</p></div></div>
      <Notice error={error} />
      {!catalog && !error && <p role="status">{t("Loading games…")}</p>}
      {catalog?.length === 0 && <p role="status">{t("No games are available.")}</p>}
      {quickGames.length > 0 && <div className="game-shortcuts" role="group" aria-label={t("Tournament games")}>{quickGames.map(item => <button type="button" aria-pressed={selected === item._id} key={item._id} onClick={() => setSelected(item._id)}>{item.name}</button>)}</div>}
      {game && <div className="opening-directory tournament-directory">
        <section className="card form-card directory-filters">
        <Field label={t("Game")} as="select" value={selected} onChange={event => setSelected(event.target.value)}>
          {catalog.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
        </Field>
        <p className="muted small tournament-source">{t("Data from") + ' '}<a href={game.liquipediaWiki ? `https://liquipedia.net/${game.liquipediaWiki}/` : 'https://liquipedia.net/'}>Liquipedia</a>{' ' + t('under license') + ' '}<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>.</p>
        </section>
        <section className="card form-card tournament-feed"><h2 dir="auto">{game.name}</h2><TournamentList key={game._id} game={game} /></section>
      </div>}
  </>;
}
