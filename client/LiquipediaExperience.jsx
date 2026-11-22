import { isolate, t } from './i18n.js';
import { useEffect, useState } from 'react';
import { liquipediaEdition, liquipediaPageUrl } from '../shared/liquipedia.js';
import { api } from './api.js';
import { Field, Notice } from './components.jsx';

export function ExperienceSource({ entry }) {
  if (!entry.liquipedia) return t(entry.competition || entry.tournament ? 'Metadata: PandaScore' : 'Metadata: manual');
  const { wiki, id, retrievedAt } = entry.liquipedia;
  const url = liquipediaPageUrl(wiki, id);
  return <>{t("Metadata:") + ' '}{url ? <a href={url} target="_blank" rel="noreferrer">Liquipedia</a> : 'Liquipedia'}{retrievedAt && <> · {t('Retrieved {date} (UTC)', { date: isolate(retrievedAt.slice(0, 10)) })}</>}</>;
}

export default function LiquipediaPicker({ game, select, full }) {
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({});
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !game.liquipediaWiki) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/profile-tournaments/${game._id}?${new URLSearchParams({ q })}`);
        if (current) setState({ data });
      } catch (error) {
        if (current) setState({ error });
      }
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [query, game._id, game.liquipediaWiki, attempt]);
  if (!game.liquipediaWiki) return <p className="muted small">{t("Liquipedia search is unavailable for this game. You can add a tournament manually.")}</p>;
  const { data, error } = state;
  return <div className="liquipedia-picker">
    <Field label={t('Search Liquipedia for {game} tournaments', { game: isolate(game.name) })} type="search" maxLength={100} value={query}
      onChange={event => { setState({}); setQuery(event.target.value); }} help={t("Search by tournament name or year. Type at least two characters.")} />
    {query.trim().length >= 2 && !data && !error && <p role="status">{t("Searching Liquipedia…")}</p>}
    <Notice error={error} />
    {error && <button type="button" className="text-button" onClick={() => { setState({}); setAttempt(value => value + 1); }}>{t("Retry Liquipedia search")}</button>}
    {data?.stale && <p role="status" className="muted small">{t("Showing cached Liquipedia information.")}</p>}
    {data?.status === 'unsupported' && <p role="status">{t("Liquipedia search is unavailable for this game.")}</p>}
    {data?.status === 'ok' && (data.tournaments.length ? <div className="tournament-results">
      {data.tournaments.map(event => <div className="tournament-result" key={event.id}>
        <div><strong dir="auto">{event.name}</strong><p className="muted small">{event.startDate || event.endDate || t("Date TBD")} · <a href={event.url} target="_blank" rel="noreferrer">Liquipedia</a></p></div>
        <button type="button" className="button secondary compact" disabled={full} onClick={() => {
          select({ name: event.name.slice(0, 200).trim(), edition: liquipediaEdition(event), liquipedia: { wiki: game.liquipediaWiki, id: event.id } });
          setQuery(''); setState({});
        }} aria-label={t('Add {name}', { name: isolate(event.name) })}>{t("Add tournament")}</button>
      </div>)}
      {data.hasMore && <p className="muted small">{t("Refine your search to see other matches.")}</p>}
    </div> : <p role="status">{t("No matches in the Liquipedia listings searched. Try another name or add the tournament manually.")}</p>)}
  </div>;
}
