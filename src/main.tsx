import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import { AdminApp } from './AdminApp';
import LicenseGuard from './components/LicenseGuard';
import './index.css';

const init = () => {
  console.log('App initializing...');
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  const root = createRoot(rootElement);

  if (window.location.pathname.startsWith('/admin')) {
    root.render(
      <StrictMode>
        <AdminApp />
      </StrictMode>
    );
  } else {
    root.render(
      <StrictMode>
        <LicenseGuard>
          <App />
        </LicenseGuard>
      </StrictMode>
    );
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
