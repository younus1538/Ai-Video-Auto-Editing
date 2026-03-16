import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { AdminApp } from './AdminApp';
import { FirebaseProvider } from './FirebaseProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import LicenseGuard from './components/LicenseGuard';
import './index.css';

const init = () => {
  console.log('App initializing...');
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  const root = createRoot(rootElement);

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <FirebaseProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={
                <LicenseGuard>
                  <App />
                </LicenseGuard>
              } />
              <Route path="/admin" element={<AdminApp />} />
            </Routes>
          </BrowserRouter>
        </FirebaseProvider>
      </ErrorBoundary>
    </StrictMode>
  );
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
