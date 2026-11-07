import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './Toasts.jsx';
import { installNavigation } from './navigation.js';
import './styles.css';

installNavigation();
createRoot(document.getElementById('root')).render(<ToastProvider><App /></ToastProvider>);
