import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {PreferencesProvider} from './lib/preferences';
import DoctorPresentation from './components/presentation/DoctorPresentation';
import './index.css';

/**
 * `/doctors-video` is the standalone presentation for doctors (also recorded
 * into the MP4 the website embeds). Everything else is the app.
 */
const isPresentation = window.location.pathname.replace(/\/+$/, '') === '/doctors-video';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>{isPresentation ? <DoctorPresentation /> : <App />}</PreferencesProvider>
  </StrictMode>,
);
