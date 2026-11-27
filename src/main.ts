import './style.css';
import { startGame } from './game';

startGame();

/* installable web app: offline support once the page has loaded (only on https, so not on the dev server) */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
