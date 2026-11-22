import { isolate, number, t } from './i18n.js';
import { useCallback, useState } from 'react';
import { Check, UserPlus } from 'lucide-react';
import { api } from './api.js';
import { Loading, Notice } from './components.jsx';
import IdentityMark from './IdentityMark.jsx';
import useResource from './useResource.js';

const labels = { player:'Player', organization:'Organization', team:'Team', member:'Member without a public profile' };
export const subjectPath = (kind,id) => '/discovery/' + kind + '/' + id;

export function FollowButton({ account, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (account.self || !account.id) return null;
  async function change() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const next = await api(subjectPath(account.kind,account.id), { method: account.following ? 'DELETE' : 'PUT' });
      onChange(next);
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  const Icon = account.following ? Check : UserPlus;
  return <div><button type="button" className={'button compact ' + (account.following ? 'secondary' : 'primary')} disabled={busy}
    aria-pressed={account.following} title={t(account.following ? 'Unfollow {name}' : 'Follow {name}', { name: isolate(account.name) })} onClick={change}>
    <Icon size={15} aria-hidden="true" />{account.following ? t("Following") : t("Follow")}</button><Notice error={error} /></div>;
}

export function AccountRow({ account, user, onChange }) {
  return <article className="discovery-account" aria-label={account.name}>
    <IdentityMark name={account.name} src={account.imageUrl} className={account.kind === 'player' ? 'person-mark' : 'org-mark'} />
    <div>{account.url ? <a href={account.url} dir="auto">{account.name}</a> : <strong>{account.name}</strong>}
      <small>{t(labels[account.kind])}</small></div>
    {user && <FollowButton account={account} onChange={onChange} />}
  </article>;
}

// Each mounted list owns one query. Changing tabs, search or subject remounts it, isolating outstanding requests.
export function PagedResults({ initial, itemsKey, cursorKey, load, children, empty }) {
  const [items,setItems] = useState(initial[itemsKey]);
  const [cursor,setCursor] = useState(initial[cursorKey]);
  const [busy,setBusy] = useState(false), [error,setError] = useState(null);
  const update = useCallback((id, values, kind) => setItems(rows => rows.map(row => row.id === id && (!kind || row.kind === kind) ? {...row,...values} : row)),[]);
  async function more() {
    setBusy(true); setError(null);
    try {
      const data = await load(cursor);
      setItems(rows => [...rows,...data[itemsKey].filter(item => !item.id || !rows.some(row => row.id === item.id && row.kind === item.kind))]);
      setCursor(data[cursorKey]);
    } catch(error) { setError(error); } finally { setBusy(false); }
  }
  return <>{items.length ? children(items,update,id=>setItems(rows=>rows.filter(row=>row.id!==id))) : empty}
    <Notice error={error} />{cursor != null && <button type="button" className="button secondary" disabled={busy} onClick={more}>{busy ? t("Loading…") : t("Load more")}</button>}</>;
}

export function Result({ resource, children }) {
  if (resource.loading) return <Loading>{t("Loading…")}</Loading>;
  if (resource.error) return <><Notice error={resource.error}/><button className="button secondary" onClick={resource.reload}>{t("Try again")}</button></>;
  return children(resource.data);
}

export function Accounts({ path, user, empty, onChange }) {
  const resource = useResource(path);
  return <Result resource={resource}>{data => <PagedResults initial={data} itemsKey="accounts" cursorKey="next" empty={empty}
    load={start=>api(path+(path.includes('?')?'&':'?')+'start='+start)}>
    {(items,update)=><div className="account-results">{items.map((item,i)=><AccountRow key={item.id ? item.kind+item.id : i} account={item} user={user}
      onChange={next=>{update(item.id,next,item.kind); onChange?.();}} />)}</div>}
  </PagedResults>}</Result>;
}

export function Connections({ kind, id, name, user }) {
  const path = subjectPath(kind,id);
  const resource = useResource(path);
  const [list,setList] = useState('');
  const [change,setChange] = useState(null);
  const [revision,setRevision] = useState(0);
  return <section className="connections card" aria-label={t("Connections")}><Result resource={resource}>{data=>{
    const info = change || data;
    return <><div className="connections-tools">
      {user && <FollowButton account={{...info,kind,id,name}} onChange={next=>{setChange(next);setRevision(n=>n+1);}}/>}
      {['followers',...(kind==='player'?['following']:[])].map(key=><button key={key} className="text-button" aria-expanded={list===key} onClick={()=>setList(list===key?'':key)}>
        <strong>{number(key === 'followers' ? info.followers : info.followingCount)}</strong> {key==='followers'?t("Followers"):t("Following")}</button>)}</div>
      {list && <Accounts key={list+revision} path={path+'/'+list} user={user} empty={<p className="muted">{t(list === 'followers' ? 'No followers yet.' : 'No following yet.')}</p>}
        onChange={()=>{setChange(null);resource.reload();}}/>}</>;
  }}</Result></section>;
}
