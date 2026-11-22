import { isolate, number, percent, t } from './i18n.js';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Maximize2, X } from 'lucide-react';
import { Field, Notice, Submit } from './components.jsx';
import { api, uploadPost } from './api.js';
import { mediaLimits } from '../shared/post-media.js';
import { postLength } from '../shared/posts.js';

const accepted = 'image/png,image/jpeg,image/webp,video/mp4,video/webm';

export function Gallery({ items = [], author }) {
  const [large, setLarge] = useState(null);
  const dialog = useRef(null);
  if (!items.length) return null;
  return <div className={'post-gallery media-count-' + items.length}>
    {items.map((item,i) => item.kind === 'video'
      ? <video key={item.key} src={item.url} poster={item.posterUrl} controls muted playsInline preload="none" aria-label={t('Gameplay clip by {name}', { name: isolate(author) })}/>
      : <button key={item.key} type="button" aria-label={t('Enlarge photo {number} by {name}', { number: number(i + 1), name: isolate(author) })}
          onClick={() => { setLarge(item.url); dialog.current.showModal(); }}>
          <img loading="lazy" src={item.url} alt={t('Photo {number} shared by {name}', { number: number(i + 1), name: isolate(author) })}/><Maximize2 size={16}/>
        </button>)}
    <dialog className="photo-viewer" ref={dialog} onClose={() => setLarge(null)} onClick={e => { if(e.target === dialog.current) dialog.current.close(); }}>
      {large && <><button className="button secondary" autoFocus onClick={() => dialog.current.close()} aria-label={t("Close photo")}><X/></button><img src={large} alt={t('Full size photo shared by {name}', { name: isolate(author) })}/></>}
    </dialog>
  </div>;
}

export function PostComposer({ path, post, onSaved, onCancel, onBusy }) {
  const [body,setBody] = useState(post?.body || '');
  const [items,setItems] = useState(post?.attachments || []);
  const [progress,setProgress] = useState(null);
  const [error,setError] = useState(null);
  const localUrls = useRef(new Set());
  const busy = progress !== null;
  useEffect(() => {
    const urls = localUrls.current;
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  },[]);
  function choose(event) {
    const files = Array.from(event.target.files);
    event.target.value = '';
    const videos = files.some(f => f.type.startsWith('video/')) || items.some(i => i.kind === 'video');
    const count = items.length + files.length;
    const message = count > mediaLimits.photos || (videos && count > 1) ? 'Choose up to four photos or one video.'
      : files.some(f => !accepted.split(',').includes(f.type)) ? 'Choose a JPEG, PNG, WebP, MP4 or WebM file.'
      : files.some(f => f.size > (f.type.startsWith('video/') ? mediaLimits.videoBytes : mediaLimits.photoBytes)) ? 'Photos can be up to 5 MB each and videos up to 25 MB.' : '';
    setError(message ? new Error(message) : null);
    if (message) return;
    setItems([...items,...files.map(file => {
      const url = URL.createObjectURL(file);
      localUrls.current.add(url);
      return { file, url, kind:file.type.startsWith('video/') ? 'video' : 'photo' };
    })]);
  }
  function release(url) { if (localUrls.current.delete(url)) URL.revokeObjectURL(url); }
  async function submit(e) {
    e.preventDefault();
    setProgress(0); setError(null); onBusy?.(true);
    try {
      const method = post ? 'PATCH' : 'POST';
      let result;
      if (items.length || post?.attachments?.length) {
        const data = new FormData();
        data.append('body',body);
        data.append('keep',JSON.stringify(items.filter(i => !i.file).map(i => i.key)));
        items.filter(i => i.file).forEach(i => data.append('media',i.file));
        result = await uploadPost(path,method,data,setProgress);
      } else result = await api(path,{method,body:{body}});
      items.forEach(i => release(i.url)); setItems([]); setBody('');
      onSaved(result.post);
    } catch(err) { setError(err); }
    finally { setProgress(null); onBusy?.(false); }
  }
  return <form className="post-form media-composer" onSubmit={submit}>
    <Field as="textarea" label={post ? t("Edit post text") : t("Write a post")} value={body} rows={3} maxLength={postLength} dir="auto"
      disabled={busy} onChange={e=>setBody(e.target.value)} error={error?.fields?.body}/>
    {items.length > 0 && <ul className="attachment-tray">{items.map((item,i) => <li key={item.url}>
      {item.kind === 'video' ? <video src={item.url} poster={item.posterUrl} controls playsInline muted/> : <img src={item.url} alt={t('Selected photo {number}', { number: number(i + 1) })}/>}
      <button type="button" disabled={busy} aria-label={t('Remove attachment {number}', { number: number(i + 1) })} onClick={()=>{setItems(items.filter(x=>x!==item));release(item.url);}}><X size={16}/></button>
    </li>)}</ul>}
    <div className="composer-tools"><label className="button secondary file-picker"><ImagePlus aria-hidden="true" size={18}/>{' ' + t("Add media") + ' '}<input type="file" aria-label={t("Add media")} accept={accepted} multiple disabled={busy} onChange={choose}/></label>
      <small>{t("Up to 4 JPEG, PNG or WebP photos (5 MB each), or one H.264 MP4 or VP8/VP9 WebM (60 seconds, 25 MB).")}</small></div>
    <Notice error={error}/>
    {busy && <div role="status"><progress value={progress} max={100}/> {progress === 100 ? t("Processing attachments…") : t('Uploading {progress}', { progress: percent(progress) })}</div>}
    <div className="post-form-actions">{onCancel && <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>{t("Cancel")}</button>}
      <Submit busy={busy} disabled={busy || (!body.trim() && !items.length)}>{post ? t("Save changes") : t("Publish post")}</Submit></div>
  </form>;
}
