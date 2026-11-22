import { isolate, number, t } from './i18n.js';
import { useCallback, useEffect, useId, useState } from 'react';
import { Bookmark, Heart, MessageCircle, Pencil, Send, Trash2 } from 'lucide-react';
import { commentLength } from '../shared/posts.js';
import { PostComposer, Gallery } from './PostMedia.jsx';
import { api } from './api.js';
import { Field, Loading, Notice, Submit } from './components.jsx';
import IdentityMark from './IdentityMark.jsx';
import { displayDate, quantity } from './presentation.js';
import { useToast } from './Toasts.jsx';
import useResource from './useResource.js';

const older = cursor => '?' + new URLSearchParams({ before: cursor });
const signIn = path => '/login?' + new URLSearchParams({ next: path });
const identityLabels = { player: 'Player profile', organization: 'Organization', team: 'Team' };
const composerLabels = { player: 'Posting as a player', organization: 'Posting as an organization', team: 'Posting as a team' };

function Author({ author, linked = true, children }) {
  const mark = author.kind === 'player' ? 'person-mark' : 'org-mark';
  return <div className="post-author">
    <IdentityMark name={author.name} src={author.imageUrl} className={mark} />
    <div>
      {linked && author.url ? <a className="post-author-name" href={author.url} dir="auto">{author.name}</a> : <strong dir="auto">{author.name}</strong>}
      {children}
    </div>
  </div>;
}

function TextForm({ label, initial = '', limit, submitLabel, onSubmit, onCancel, focus = false }) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try { await onSubmit(body); setBody(''); }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <form className="post-form" onSubmit={submit}>
    <Field as="textarea" label={label} value={body} onChange={event => setBody(event.target.value)} maxLength={limit}
      rows={limit === commentLength ? 2 : 3} required dir="auto" autoFocus={focus} disabled={busy} error={error?.fields?.body} />
    <Notice error={error} />
    <div className="post-form-actions">
      {body.length > limit * 0.8 && <small className="muted post-remaining">{t('{count} characters left', { count: number(limit - body.length) })}</small>}
      {onCancel && <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>{t("Cancel")}</button>}
      <Submit busy={busy} disabled={busy || !body.trim() || (Boolean(onCancel) && body.trim() === initial)}>{submitLabel} <Send size={15} aria-hidden="true" /></Submit>
    </div>
  </form>;
}

function Comments({ initial, path, returnTo, signedIn, onCount }) {
  const [comments, setComments] = useState(initial.comments);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const notify = useToast();
  async function add(body) {
    const { comment, commentCount } = await api(path, { method: 'POST', body: { body } });
    setComments(previous => [comment, ...previous.filter(item => item.id !== comment.id)]);
    onCount(commentCount);
    notify('Comment posted.');
  }
  async function remove(id) {
    setBusy(id);
    setError(null);
    try {
      const { commentCount } = await api(`${path}/${id}`, { method: 'DELETE' });
      setComments(previous => previous.filter(item => item.id !== id));
      onCount(commentCount);
      notify('Comment deleted.');
    } catch (error) { setError(error); }
    finally { setBusy(null); }
  }
  async function loadOlder() {
    setBusy('page');
    setError(null);
    try {
      const result = await api(path + older(cursor));
      setComments(previous => [...previous, ...result.comments.filter(item => !previous.some(comment => comment.id === item.id))]);
      setCursor(result.nextCursor);
      onCount(result.commentCount);
    } catch (error) { setError(error); }
    finally { setBusy(null); }
  }
  return <>
    {signedIn ? <TextForm label={t("Write a comment")} limit={commentLength} onSubmit={add} submitLabel={t("Post comment")} />
      : <p className="muted small"><a href={signIn(returnTo)}>{t("Log in")}</a>{' ' + t("to join the conversation.")}</p>}
    <Notice error={error} />
    {comments.length > 0 && <ul className="post-comments">{comments.map(comment => <li key={comment.id}>
      <div className="post-comment-header">
        <Author author={comment.author}><time className="small muted" dateTime={comment.createdAt} dir="auto">{displayDate(comment.createdAt)}</time></Author>
        {signedIn && comment.canDelete && <button type="button" className="button secondary danger compact" disabled={Boolean(busy)} onClick={() => remove(comment.id)}>{t("Delete comment")}</button>}
      </div>
      <div className="post-comment-content"><p className="post-body" dir="auto">{comment.body}</p></div>
    </li>)}</ul>}
    {comments.length === 0 && !cursor && <p className="muted small">{t("No comments yet.")}</p>}
    {cursor && <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={loadOlder}>{busy === 'page' ? t("Loading…") : t("Older comments")}</button>}
  </>;
}

function CommentThread({ id, postId, signedIn, returnTo, onCount }) {
  const path = `/posts/${postId}/comments`;
  const result = useResource(path);
  const count = result.data?.commentCount;
  useEffect(() => { if (count !== undefined) onCount(count); }, [count, onCount]);
  return <div id={id} className="post-thread">
    {result.loading ? <Loading>{t("Loading comments…")}</Loading> : result.error ? <>
      <Notice error={result.error} /><button className="button secondary" onClick={result.reload}>{t("Retry comments")}</button>
    </> : <Comments initial={result.data} path={path} returnTo={returnTo} signedIn={signedIn} onCount={onCount} />}
  </div>;
}

export function PostCard({ post, author, signedIn, canPublish, onUpdate, onRemove, onUnsave, children, returnTo = author.url }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const threadId = useId();
  const notify = useToast();
  const path = '/posts/' + post.id;
  const updateCommentCount = useCallback(commentCount => onUpdate(post.id, { commentCount }), [post.id, onUpdate]);
  function edit(updated) {
    onUpdate(post.id, updated);
    setMode('');
    notify('Post updated.');
  }
  async function act(action) {
    setBusy(true);
    setError(null);
    try {
      if (action === 'delete') {
        await api(path, { method: 'DELETE' });
        onRemove();
        notify('Post deleted.');
      } else if (action === 'bookmark') {
        const result = await api(path + '/bookmark', { method: post.saved ? 'DELETE' : 'PUT' });
        onUpdate(post.id, result);
        if (!result.saved) onUnsave?.();
      } else {
        onUpdate(post.id, await api(path + '/reaction', { method: post.reacted ? 'DELETE' : 'PUT' }));
      }
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <article className="card post-card" aria-label={t('Post by {name}', { name: isolate(author.name) })}>
    <div className="post-card-header">
      <Author author={author}><p className="muted small post-byline"><span>{t(identityLabels[author.kind])}</span><time dateTime={post.createdAt} dir="auto">{displayDate(post.createdAt)}</time>{post.editedAt && <span>{t("Edited")}</span>}</p></Author>
      {children}
      {canPublish && !mode && <div className="post-management">
        <button type="button" className="button secondary compact" onClick={() => setMode('edit')}><Pencil size={14} aria-hidden="true" />{t("Edit post")}</button>
        <button type="button" className="button secondary danger compact" onClick={() => setMode('delete')}><Trash2 size={14} aria-hidden="true" />{t("Delete post")}</button>
      </div>}
    </div>
    {mode === 'edit' ? <PostComposer path={path} post={post} onSaved={edit} onCancel={() => setMode('')} /> : <>
      {post.body && <p className="post-body" dir="auto">{post.body}</p>}
      <Gallery items={post.attachments} author={author.name}/></>}
    {mode === 'delete' && <div className="post-delete">
      <p>{t("Delete this post and remove its discussion from the page?")}</p>
      <div className="post-form-actions">
        <button className="button secondary" type="button" disabled={busy} onClick={() => { setMode(''); setError(null); }}>{t("Cancel")}</button>
        <button className="button secondary danger" type="button" disabled={busy} onClick={() => act('delete')}>{t("Confirm delete post")}</button>
      </div>
    </div>}
    <Notice error={error} />
    <div className="post-engagement">
      {signedIn ? <button type="button" className="button secondary compact" aria-pressed={post.reacted} aria-label={t('React, {count}', { count: quantity(post.reactionCount, 'reaction') })} disabled={busy} onClick={() => act('react')}>
        <Heart size={16} aria-hidden="true" fill={post.reacted ? 'currentColor' : 'none'} /> <bdi>{quantity(post.reactionCount, 'reaction')}</bdi>
      </button> : <a className="guest-reaction" href={signIn(returnTo)} aria-label={t('Log in to react, {count}', { count: quantity(post.reactionCount, 'reaction') })}><Heart size={16} aria-hidden="true" /> <bdi>{quantity(post.reactionCount, 'reaction')}</bdi></a>}
      <button type="button" className="button secondary compact" aria-expanded={expanded} aria-controls={expanded ? threadId : undefined} onClick={() => setExpanded(!expanded)}>
        <MessageCircle size={16} aria-hidden="true" /><bdi>{quantity(post.commentCount, 'comment')}</bdi>
      </button>
      {signedIn && <button type="button" className="button secondary compact" aria-pressed={Boolean(post.saved)}
        aria-label={t('Save post')} disabled={busy} onClick={() => act('bookmark')}>
        <Bookmark size={16} aria-hidden="true" fill={post.saved ? 'currentColor' : 'none'} />{t(post.saved ? 'Saved' : 'Save')}
      </button>}
    </div>
    {expanded && <CommentThread id={threadId} postId={post.id} signedIn={signedIn} returnTo={returnTo} onCount={updateCommentCount} />}
  </article>;
}

function PostFeed({ path, signedIn, initial }) {
  const [posts, setPosts] = useState(initial.posts);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [moreError, setMoreError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const { author } = initial;
  const canPublish = signedIn && initial.canPublish;
  const notify = useToast();
  const updatePost = useCallback((id, changes) => {
    setPosts(previous => previous.map(item => item.id === id ? { ...item, ...changes } : item));
  }, []);
  function publish(post) {
    setPosts(previous => [post, ...previous.filter(item => item.id !== post.id)]);
    notify('Post published.');
  }
  async function loadOlder() {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await api(path + older(cursor));
      setPosts(previous => [...previous, ...result.posts.filter(item => !previous.some(post => post.id === item.id))]);
      setCursor(result.nextCursor);
    } catch (error) { setMoreError(error); }
    finally { setLoadingMore(false); }
  }
  return <>
    {canPublish && <div className="card post-card post-composer">
      <div className="post-card-header"><Author author={author} linked={false}><p className="muted small">{t(composerLabels[author.kind])}</p></Author><span className="badge">{t("Public post")}</span></div>
      <PostComposer path={path} onSaved={publish}/>
    </div>}

    {posts.map(post => <PostCard key={post.id} post={post} author={author} signedIn={signedIn} canPublish={canPublish}
      onUpdate={updatePost}
      onRemove={() => setPosts(previous => previous.filter(item => item.id !== post.id))} />)}
    {posts.length === 0 && !cursor && <div className="card post-empty"><MessageCircle size={22} aria-hidden="true" /><h3>{t("No posts yet.")}</h3><p className="muted">{canPublish ? t("Share a team update or a competitive highlight above.") : t("Updates from this profile will appear here.")}</p></div>}
    <Notice error={moreError} />
    {cursor && <button type="button" className="button secondary" onClick={loadOlder} disabled={loadingMore}>{loadingMore ? t("Loading…") : t("Older posts")}</button>}
  </>;
}

export default function Posts({ kind, id, signedIn = false }) {
  const path = `/posts/by/${kind}/${id}`;
  const result = useResource(path);
  return <section id="posts" className="posts-section" aria-labelledby="posts-title">
    <h2 id="posts-title">{t("Posts")}</h2>
    {result.loading ? <Loading>{t("Loading posts…")}</Loading> : result.error ? <>
      <Notice error={result.error} /><button className="button secondary" onClick={result.reload}>{t("Retry posts")}</button>
    </> : <PostFeed key={path} path={path} signedIn={signedIn} initial={result.data} />}
  </section>;
}
