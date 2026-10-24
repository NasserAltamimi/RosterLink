import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PublicProfile from './PublicProfile.jsx';
import PasswordRecovery from './PasswordRecovery.jsx';
import './styles.css';

const root = createRoot(document.getElementById('root'));
let recoveryVisit = 0;
function renderPage() {
  const shared = location.pathname.match(/^\/p\/([a-f0-9]{24})\/?$/i);
  const recovery = ['/forgot-password', '/reset-password'].includes(location.pathname);
  // Keep the bearer secret in memory only, and remove it from the visible URL/history.
  const resetToken = location.pathname === '/reset-password' ? location.hash.slice(1) : '';
  if (resetToken) history.replaceState(null, '', location.pathname);
  root.render(shared ? <PublicProfile profileId={shared[1]} /> : recovery ? <PasswordRecovery key={++recoveryVisit} token={resetToken} /> : <App />);
}
renderPage();
// Opening another email link in an existing recovery tab can be a fragment-only navigation.
window.addEventListener('hashchange', () => {
  if (location.pathname === '/reset-password' && location.hash) renderPage();
});
