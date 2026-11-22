import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './Toasts.jsx';
import { installNavigation } from './navigation.js';
import { installDocumentLanguage } from './i18n.js';
import './styles.css';
import './night-circuit.css';
import './experience.css';
import './post-media.css';

installNavigation();
installDocumentLanguage();

createRoot(document.getElementById('root')).render(<ToastProvider><App /></ToastProvider>);
