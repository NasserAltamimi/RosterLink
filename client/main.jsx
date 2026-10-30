import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PublicProfile from './PublicProfile.jsx';
import PasswordRecovery from './PasswordRecovery.jsx';
import Recruitment from './Recruitment.jsx';
import { ToastProvider } from './Toasts.jsx';
import { publicProfileRoute } from '../shared/public-profile-route.js';
import './styles.css';

const root = createRoot(document.getElementById('root'));
let recoveryVisit = 0;
function renderPage() {
  const shared = publicProfileRoute(location.pathname);
  const recovery = ['/forgot-password', '/reset-password'].includes(location.pathname);
  const recruitment = /^\/(manage|organizations|teams|openings)(\/|$)/.test(location.pathname);
  // Keep the bearer secret in memory only, and remove it from the visible URL/history.
  const resetToken = location.pathname === '/reset-password' ? location.hash.slice(1) : '';
  if (resetToken) history.replaceState(null, '', location.pathname);
  root.render(<ToastProvider>{shared ? <PublicProfile profileId={shared.profileId} /> : recovery ? <PasswordRecovery key={++recoveryVisit} token={resetToken} /> : recruitment ? <Recruitment /> : <App />}</ToastProvider>);
}
renderPage();
// Opening another email link in an existing recovery tab can be a fragment-only navigation.
window.addEventListener('hashchange', () => {
  if (location.pathname === '/reset-password' && location.hash) renderPage();
});
