import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PublicProfile from './PublicProfile.jsx';
import { ToastProvider } from './Toasts.jsx';
import './styles.css';

const shared = location.pathname.match(/^\/p\/([a-f0-9]{24})\/?$/i);
createRoot(document.getElementById('root')).render(<ToastProvider>{shared ? <PublicProfile profileId={shared[1]} /> : <App />}</ToastProvider>);
