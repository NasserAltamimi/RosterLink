import { getLanguage, t } from './i18n.js';
import { ArrowRight, CalendarCheck, Crosshair, UserRound } from 'lucide-react';
import Auth from './Auth.jsx';
import { Notice } from './components.jsx';
import useResource from './useResource.js';
import IdentityMark from './IdentityMark.jsx';
import OpeningPreview from './OpeningPreview.jsx';
import { featuredGames, quantity } from './presentation.js';

const stages = [
  [UserRound, 'Build your profile', 'Share your games, rank, and availability.'],
  [Crosshair, 'Find an opening', 'Look for a team that fits the way you play.'],
  [CalendarCheck, 'Take the tryout', 'Track your application and respond to invites.'],
];

export default function Landing({ onAuthenticated }) {
  const openings = useResource('/openings');
  const catalog = useResource('/games');
  const featured = featuredGames(catalog.data?.games);
  const roles = openings.data?.openings.slice(0, 3) || [];
  return <>
    <section className="landing-hero">
      <div className="landing-photo" aria-hidden="true" />
      <div className="landing-copy">
        <p className="eyebrow">{t("Esports recruitment")}</p>
        <h1>{getLanguage() === 'ar' ? <>انضم إلى<br />الفريق<span>.</span></> : <>Get on<br />the roster<span>.</span></>}</h1>
        <p className="landing-lede">{t("Build your player profile, find open roles, and connect with esports teams.")}</p>
        <div className="heading-actions"><a className="button primary" href="/openings">{t("Browse openings") + ' '}<ArrowRight size={18} aria-hidden="true" /></a><a className="button secondary" href="/register">{t("Create account")}</a></div>
      </div>
    </section>
    <div className="landing-shell">
      <ol className="landing-stages">
        {stages.map(([Icon, title, detail]) => <li key={title}><span className="destination-icon"><Icon size={22} aria-hidden="true" /></span><div><h2>{t(title)}</h2><p>{t(detail)}</p></div></li>)}
      </ol>
      <section className="landing-discovery">
        <div className="card landing-open-roles">
          <div className="section-heading"><h2>{t("Open roles")}</h2><a className="text-button" href="/openings">{t("All openings") + ' '}<ArrowRight size={15} aria-hidden="true" /></a></div>
          {openings.loading && <p className="muted" role="status">{t("Loading open roles…")}</p>}
          <Notice error={openings.error} />
          {roles.length > 0 && <><p className="small muted">{quantity(openings.data.openings.length, 'active opening')}</p><ul className="opening-preview-list">{roles.map(role => <OpeningPreview key={role.id} opening={role} />)}</ul></>}
          {!openings.loading && !openings.error && roles.length === 0 && <p className="landing-empty muted">{t("No active openings right now. Explore tournaments while you’re here.")}</p>}
        </div>
        <aside className="landing-games">
          <h2>{t("Explore by game")}</h2>
          <div className="landing-game-links">{featured.map(game => <a href={`/openings?game=${game._id}`} key={game._id}><IdentityMark name={game.name} src={game.imageUrl} className="game-monogram" /><span>{game.name}</span></a>)}</div>
          <a className="text-button" href="/tournaments">{t("Browse tournaments") + ' '}<ArrowRight size={15} aria-hidden="true" /></a>
        </aside>
      </section>
      <section className="landing-join">
        <div><h2>{t("Build your player profile.")}</h2><p className="muted">{t("Create an account to apply for openings. The same account can manage your teams.")}</p></div>
        <Auth mode="register" embedded onAuthenticated={onAuthenticated} />
      </section>
    </div>
  </>;
}
