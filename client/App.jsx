import { useEffect, useState } from 'react';
import { api, endSession } from './api.js';
import Auth from './Auth.jsx';
import ProfileForm from './ProfileForm.jsx';
import Images from './Images.jsx';
import Games from './Games.jsx';
import { Brand, Loading, Notice } from './components.jsx';
import { LegacyDetails } from './Experience.jsx';
import { gameFields } from '../shared/game-form.js';
import { useToast } from './Toasts.jsx';

function Overview({ profile, sections, games, navigate }) {
  const notify = useToast();
  const [linkStatus, setLinkStatus] = useState(null);
  async function copyLink() {
    const link = `${location.origin}/p/${profile.id}`;
    // The fallback stays inline because the player still needs to copy the link manually.
    try { await navigator.clipboard.writeText(link); setLinkStatus(null); notify('Public link copied.'); }
    catch { setLinkStatus(`Copy this link: ${link}`); }
  }
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <section className="card player-card">
      <div className="player-cover">{profile.headerImageUrl ? <img src={profile.headerImageUrl} alt="Your player header" /> : <><span className="cover-word" aria-hidden="true">NEXT UP.</span><span className="cover-mark" aria-hidden="true">↗</span></>}</div>
      <div className="player-info"><div className="avatar">{profile.profileImageUrl ? <img src={profile.profileImageUrl} alt="Your player avatar" /> : <span>{profile.displayName.slice(0, 2).toUpperCase()}</span>}</div>
        <div className="player-heading"><div><p className="eyebrow">PLAYER PROFILE</p><h2 dir="auto">{profile.displayName}</h2><p className="muted" dir="auto">{profile.region} <span aria-hidden="true">·</span> {profile.languages.join(' / ')}</p></div><div className="heading-actions"><button className="button secondary" onClick={copyLink}>Copy public link</button><button className="button secondary" onClick={() => navigate('edit')}>Edit profile <span aria-hidden="true">↗</span></button></div></div>
        {linkStatus && <Notice>{linkStatus}</Notice>}
        <div className="player-bio"><h3>About</h3><p dir="auto">{profile.bio || 'Tell future teammates about your play style and goals. Add a bio to make this space yours.'}</p></div>
      </div>
    </section>
    <div className="section-title"><div><p className="eyebrow">WHERE YOU COMPETE</p><h2>Game experience</h2></div><button className="text-button" onClick={() => navigate('games')}>Manage games ↗</button></div>
    {sections.length ? sections.map(section => {
      const game = games.find(game => game._id === section.gameId);
      return <section className="card game-summary" key={section.id}><div className="game-monogram" aria-hidden="true">{game?.name.split(' ').map(word => word[0]).join('') || 'G'}</div><div className="game-summary-body"><div className="section-heading"><h3>{game?.name || 'Saved game'}</h3><span className="badge">Self-reported</span></div><dl className="game-details">{gameFields.filter(field => section.details[field.key]).map(field => <div key={field.key}><dt>{field.label}</dt><dd dir="auto">{section.details[field.key]}</dd></div>)}</dl>
        {Boolean(section.experience?.length) && <div className="experience-summary"><h4>Competitive experience · Self-reported</h4><p className="muted small">Competition metadata does not verify identity, participation, or results.</p><ul>{section.experience.map((entry, index) => <li key={index}><strong dir="auto">{entry.name}</strong> <span dir="auto">{entry.edition}{entry.stage && ` · ${entry.stage}`} · {entry.placement}</span><p className="muted small">{entry.tournament || entry.competition ? 'Metadata: PandaScore' : 'Metadata: manual'} · Participation and results: self-reported</p></li>)}</ul></div>}
        <LegacyDetails details={section.legacyDetails} />
      </div></section>;
    }) : <section className="card empty-state"><span className="empty-symbol" aria-hidden="true">＋</span><h3>Put your game on the map.</h3><p className="muted">Add your game experience, rank, and availability.</p><button className="button primary" onClick={() => navigate('games')}>Add your first game ↗</button></section>}
  </>;
}

export default function App() {
  const notify = useToast();
  const [user, setUser] = useState(null);
  const [games, setGames] = useState([]);
  const [data, setData] = useState({ profile: null, sections: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState('overview');
  const [loggingOut, setLoggingOut] = useState(false);

  async function bootstrap() {
    setLoading(true); setError(null);
    try {
      const [session, catalog] = await Promise.all([api('/auth/session'), api('/games')]);
      setGames(catalog.games); setUser(session.user);
      if (session.user) setData(await api('/profiles/me'));
    } catch (error) { setError(error); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    bootstrap();
    const expired = () => { setUser(null); setData({ profile: null, sections: [] }); setPage('overview'); api('/auth/session').catch(() => {}); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  async function authenticated(nextUser) {
    const nextData = await api('/profiles/me');
    setData(nextData); setUser(nextUser); setPage('overview'); setError(null);
  }
  async function logout() {
    setLoggingOut(true); setError(null);
    try { await endSession(); setUser(null); setData({ profile: null, sections: [] }); setPage('overview'); notify('Logged out.'); }
    catch (error) { setError(error); }
    finally { setLoggingOut(false); }
  }
  if (loading) return <main className="startup"><Brand /><Loading /></main>;
  if (!user && error) return <main className="startup"><Brand /><div className="card retry-card"><h1>Let’s reconnect.</h1><Notice error={error} /><button className="button primary" onClick={bootstrap}>Try again</button></div></main>;
  if (!user) return <><nav className="public-recruitment-links" aria-label="Recruitment"><a href="/openings">Browse openings ↗</a><a href="/manage">Manage organization ↗</a></nav><Auth onAuthenticated={authenticated} /></>;

  const { profile, sections } = data;
  const updateProfile = profile => setData(previous => ({ ...previous, profile }));
  const saveSection = section => setData(previous => ({ ...previous, sections: [...previous.sections.filter(item => item.gameId !== section.gameId), section] }));
  return <>
    <header className="topbar"><Brand /><div className="topbar-right"><span className="account-email">{user.email}</span><button className="button secondary compact" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</button></div></header>
    <div className="workspace">
      <aside className="sidebar"><p className="eyebrow">PLAYER WORKSPACE</p><nav aria-label="Player workspace">{[['overview', '◫', 'Overview'], ['edit', '✎', 'Edit profile'], ['games', '⊞', 'Game profiles']].map(([id, icon, label]) => <button key={id} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><span aria-hidden="true">{icon}</span>{label}<span className="nav-arrow" aria-hidden="true">↗</span></button>)}</nav>
        <nav className="recruitment-sidebar" aria-label="Recruitment"><a href="/openings">Browse openings ↗</a><a href="/manage">Manage organization ↗</a></nav>
        <div className="sidebar-note"><span className="small-label">A STRONG START</span><h3>Your story.<br />Your next team.</h3><p>Build a profile that shows what you bring to the game.</p><span className="sidebar-arrow" aria-hidden="true">↗</span></div>
        <p className="sidebar-footer">ROSTERLINK / PLAYER FOUNDATION</p>
      </aside>
      <main className="main-content" id="main-content">
        <div className="page-intro"><div><p className="eyebrow">LET’S BUILD WHAT’S NEXT</p><h1>{!profile ? 'Your journey starts here.' : page === 'overview' ? 'Your player profile.' : page === 'edit' ? 'Make it personal.' : 'Bring your game.'}</h1><p className="muted">{!profile ? 'Start with the essentials, then add your game experience.' : page === 'overview' ? 'A little about you. A lot of potential.' : page === 'edit' ? 'Keep your details and profile visuals up to date.' : 'Give each game its own space on your profile.'}</p></div><span className="workspace-tag">PLAYER SPACE <span aria-hidden="true">↗</span></span></div>
        <Notice error={error} />
        {!profile ? <><div className="onboarding-note"><span>01 / 03</span><p>Create your profile → Add your images → Add your game</p></div><ProfileForm profile={null} onSaved={setData} /></> : page === 'overview' ? <Overview profile={profile} sections={sections} games={games} navigate={setPage} /> : page === 'edit' ? <><ProfileForm key={profile.id} profile={profile} onSaved={result => updateProfile(result.profile)} /><Images profile={profile} onSaved={updateProfile} /></> : <Games profile={profile} games={games} sections={sections} onSaved={saveSection} onRemoved={id => setData(previous => ({ ...previous, sections: previous.sections.filter(section => section.gameId !== id) }))} />}
        <footer className="workspace-footer"><span>Your next chapter starts with you.</span><span>RosterLink © {new Date().getFullYear()}</span></footer>
      </main>
    </div>
  </>;
}
