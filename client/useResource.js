import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function useResource(path) {
  const [state, setState] = useState({ loading: true, data: null, error: null, path });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ loading: true, data: null, error: null, path });
    api(path).then(data => { if (active) setState({ data, loading: false, error: null, path }); }, error => { if (active) setState({ data: null, loading: false, error, path }); });
    return () => { active = false; };
  }, [path, revision]);
  return { ...(state.path === path ? state : { loading: true, data: null, error: null }), reload: () => setRevision(value => value + 1) };
}
