// Reserve the public-profile URL namespace, including malformed or incomplete links.
export function publicProfileRoute(pathname) {
  if (!/^\/p(?:\/|$)/i.test(pathname)) return null;
  const match = pathname.match(/^\/p\/([a-f0-9]{24})\/?$/i);
  return { profileId: match?.[1] || null };
}
