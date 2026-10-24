import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Brand, Loading, Notice } from './components.jsx';
import { gameFields } from '../shared/game-form.js';

// SF-13: read-only public player profile opened from a shared link (/p/<profileId>).
export default function PublicProfile({ profileId }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    Promise.all([api(`/public/profiles/${profileId}`), api('/games')])
      .then(([data, catalog]) => setState({ data, games: catalog.games }))
      .catch(error => setState({ error }));
  }, [profileId]);

  if (state.loading) return <main className="startup"><Brand /><Loading>Loading profile…</Loading></main>;
  if (state.error) return <main className="startup"><Brand /><div className="card retry-card"><h1>{state.error.status === 404 ? 'Profile not found.' : 'Let’s reconnect.'}</h1><Notice error={state.error} /><a className="button primary" href="/">Go to RosterLink</a></div></main>;

  const { profile, sections } = state.data;
  return <>
    <header className="topbar"><Brand /><div className="topbar-right"><a className="button secondary compact" href="/">Open RosterLink</a></div></header>
    <main className="main-content" id="main-content">
      <section className="card player-card">
        <div className="player-cover">{profile.headerImageUrl ? <img src={profile.headerImageUrl} alt="Player header" /> : <><span className="cover-word" aria-hidden="true">NEXT UP.</span><span className="cover-mark" aria-hidden="true">↗</span></>}</div>
        <div className="player-info"><div className="avatar">{profile.profileImageUrl ? <img src={profile.profileImageUrl} alt="Player avatar" /> : <span>{profile.displayName.slice(0, 2).toUpperCase()}</span>}</div>
          <div className="player-heading"><div><p className="eyebrow">PLAYER PROFILE</p><h1 dir="auto">{profile.displayName}</h1><p className="muted" dir="auto">{profile.region} <span aria-hidden="true">·</span> {profile.languages.join(' / ')}</p></div></div>
          {profile.bio && <div className="player-bio"><h3>About</h3><p dir="auto">{profile.bio}</p></div>}
        </div>
      </section>
      <div className="section-title"><div><p className="eyebrow">WHERE THEY COMPETE</p><h2>Game experience</h2></div></div>
      {sections.length ? sections.map(section => {
        const game = state.games.find(item => item._id === section.gameId);
        return <section className="card game-summary" key={section.gameId}><div className="game-monogram" aria-hidden="true">{game?.name.split(' ').map(word => word[0]).join('') || 'G'}</div><div className="game-summary-body"><div className="section-heading"><h3>{game?.name || 'Game'}</h3><span className="badge">Self-reported</span></div>
          <dl className="game-details">{gameFields.filter(field => section.details[field.key]).map(field => <div key={field.key}><dt>{field.label}</dt><dd dir="auto">{section.details[field.key]}</dd></div>)}</dl>
          {Boolean(section.experience.length) && <div className="experience-summary"><h4>Competitive experience · Self-reported</h4><p className="muted small">Competition metadata does not verify identity, participation, or results.</p><ul>{section.experience.map((entry, index) => <li key={index}><strong dir="auto">{entry.name}</strong> <span dir="auto">{entry.edition}{entry.stage && ` · ${entry.stage}`} · {entry.placement}</span></li>)}</ul></div>}
        </div></section>;
      }) : <section className="card empty-state"><h3>No games added yet.</h3></section>}
    </main>
  </>;
}
