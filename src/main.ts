import { playCurtainOnce } from './app/curtain';
import { startApp } from './app/router';
import './app/app.css';

// Reading window.sessionStorage itself throws when site data is blocked; the curtain then falls back to its window flag.
let session: Storage;
try { session = window.sessionStorage; } catch { session = { getItem: () => null, setItem: () => {} } as unknown as Storage; }
playCurtainOnce(document, session);
void startApp(document.getElementById('app')!);
