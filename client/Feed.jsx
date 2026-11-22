import { t } from './i18n.js';
import { useState } from 'react';
import { Newspaper, Search, SquarePen } from 'lucide-react';
import { PostComposer } from './PostMedia.jsx';
import { useToast } from './Toasts.jsx';
import { api } from './api.js';
import { Field } from './components.jsx';
import { Accounts, FollowButton, PagedResults, Result } from './Connections.jsx';
import { PostCard } from './Posts.jsx';
import useResource from './useResource.js';
import { navigate } from './navigation.js';

function feedUrl(mode, tab, query) {
  const params = new URLSearchParams();
  if (mode === 'accounts') params.set('find','accounts');
  if (tab) params.set('tab',tab);
  if (query) params.set('q',query);
  return '/feed' + (params.size ? '?' + params : '');
}

function SearchForm({ accounts, query, onSearch }) {
  const [text,setText] = useState(query);
  return <form role="search" className="feed-search" onSubmit={e=>{e.preventDefault();onSearch(text.trim());}}>
    <Field type="search" label={accounts ? t("Find accounts by name or handle") : t("Search post text or author")} value={text} dir="auto" maxLength={100}
      placeholder={accounts ? t("Player, organization, or team") : t("Search posts")} onChange={e=>setText(e.target.value)}/>
    <button type="submit" className="button secondary"><Search size={16} aria-hidden="true"/>{t("Search")}</button>
    {(query || text) && <button type="button" className="text-button" onClick={()=>{setText('');onSearch('');}}>{t("Clear search")}</button>}
  </form>;
}

function FeedComposer({ onSaved, onCancel }) {
  const resource = useResource('/posts/identities');
  const [selected,setSelected] = useState('');
  const [busy,setBusy] = useState(false);
  return <section className="card post-card post-composer"><Result resource={resource}>{({identities}) => {
    const author = identities.find(i => i.id === selected) || identities[0];
    if (!author) return <p><a href="/profile">{t("Create your player profile")}</a>{' ' + t("to publish a post.")}</p>;
    return <><label className="field">{t("Posting as")}<select value={author.id} disabled={busy} onChange={e=>setSelected(e.target.value)}>
      {identities.map(i=><option key={i.id} value={i.id}>{i.name} · {t({ player: 'Player', organization: 'Organization', team: 'Team' }[i.kind])}</option>)}</select></label>
      <PostComposer path={'/posts/by/'+author.kind+'/'+author.id} onBusy={setBusy} onSaved={onSaved} onCancel={onCancel}/></>;
  }}</Result></section>;
}

export default function Feed({ user }) {
  const [composing,setComposing] = useState(false);
  const [revision,setRevision] = useState(0);
  const notify = useToast();
  const params = new URLSearchParams(location.search);
  const accounts = params.get('find') === 'accounts';
  const tab = ['all','following'].includes(params.get('tab')) ? params.get('tab') : '';
  const q = (params.get('q') || '').slice(0,100);
  const mode = accounts ? 'accounts' : 'posts';
  const query = new URLSearchParams({q});
  if (tab) query.set('tab',tab);
  const path = '/discovery/feed?' + query;
  return <div className="discovery-feed"><header className="directory-heading discovery-heading"><span className="destination-icon"><Newspaper aria-hidden="true"/></span><div><h1>{t("Feed")}</h1><p className="muted">{t("Highlights, match results and roster updates.")}</p></div>
    {user && <button className="button primary feed-publish" aria-expanded={composing} onClick={()=>setComposing(true)}><SquarePen size={17}/>{' ' + t("Create post")}</button>}</header>
    {composing && user && <FeedComposer onCancel={()=>setComposing(false)} onSaved={()=>{
      setComposing(false); setRevision(n=>n+1); notify('Post published.'); navigate(feedUrl('posts','all',''));
    }}/>}
    <div className="feed-layout"><aside className="feed-tools">
    <nav className="feed-modes" aria-label={t("Search in")}><a href={feedUrl('posts',tab,'')} aria-current={!accounts?'page':undefined}>{t("Posts")}</a>
      <a href={feedUrl('accounts',tab,'')} aria-current={accounts?'page':undefined}>{t("Find accounts")}</a></nav>
    <SearchForm key={mode+':'+q} accounts={accounts} query={q} onSearch={value=>navigate(feedUrl(mode,tab,value))}/>
    </aside><section className="feed-stream" aria-label={accounts ? t("Account results") : t("Posts")}>
    {accounts ? <Accounts key={q} path={'/discovery/accounts?'+new URLSearchParams({q})} user={user}
      empty={<section className="card empty-state"><h2>{t("No matching accounts")}</h2><a href={feedUrl(mode,tab,'')}>{t("Show all accounts")}</a></section>}/> :
      <Timeline key={path+revision} path={path} user={user} q={q}/>}
    </section></div></div>;
}

function Timeline({ path,user,q }) {
  const result = useResource(path);
  return <Result resource={result}>{data=><>
    <nav className="game-shortcuts feed-tabs" aria-label={t("Post timeline")}>
      {user && <a href={feedUrl('posts','following',q)} aria-current={data.tab==='following'?'page':undefined}>{t("Following")}</a>}
      <a href={feedUrl('posts','all',q)} aria-current={data.tab==='all'?'page':undefined}>{t("All")}</a>
    </nav>
    <PagedResults initial={data} itemsKey="posts" cursorKey="nextCursor" load={before=>api('/discovery/feed?'+new URLSearchParams({tab:data.tab,q,before}))}
      empty={<section className="card empty-state"><h2>{q?t("No matching posts"):data.tab==='following'?t("No posts from accounts you follow yet"):t("No posts yet")}</h2>
        <div className="heading-actions">{q && <a href={feedUrl('posts',data.tab,'')}>{t("Clear search")}</a>}
        {data.tab==='following' && <a href={feedUrl('posts','all',q)}>{t("View all posts")}</a>}<a href={feedUrl('accounts',data.tab,'')}>{t("Find accounts")}</a></div></section>}>
      {(posts,update,remove)=>posts.map(post=><PostCard key={post.id} post={post} author={post.author} signedIn={Boolean(user)}
        returnTo={feedUrl('posts',data.tab,q)} canPublish={post.author.canPublish} onUpdate={update} onRemove={()=>remove(post.id)}>
        {user && <FollowButton account={post.author} onChange={next=>{
          for (const item of posts.filter(item=>item.author.kind===post.author.kind && item.author.id===post.author.id)) {
            if (data.tab==='following' && !next.following) remove(item.id);
            else update(item.id,{author:{...item.author, following:next.following}});
          }
        }}/>}
      </PostCard>)}
    </PagedResults>
  </>}</Result>;
}
