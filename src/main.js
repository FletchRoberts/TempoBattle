import { loadPoolStore } from './ui/pool-store.js';
import { startApp } from './ui/app.js';

const view = document.getElementById('view');
view.innerHTML = '<p class="loading">Loading opponents…</p>';
loadPoolStore().then(startApp).catch(err => {
  view.innerHTML = `<p class="loading">The game couldn't start: ${err.message}</p>`;
  console.error(err);
});
