/* How-to page: search, topic chips, open a guide from a shared link, copy a guide's link.
   The guides are plain HTML in howto.html, so the page works and is searchable without this file. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const groups = $$('.group');
  const guides = $$('.rows > li');
  const q = $('#q'), count = $('#count'), none = $('#none');
  const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");
  const text = new Map(guides.map((li) => [li, fold(li.textContent)]));
  let topic = '';

  function apply() {
    const words = fold(q.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const g of groups) {
      const inTopic = !topic || g.dataset.g === topic;
      let n = 0;
      for (const li of $$('.rows > li', g)) {
        const hit = inTopic && words.every((w) => text.get(li).includes(w));
        li.hidden = !hit;
        if (hit) n++;
      }
      g.hidden = n === 0;
      shown += n;
      // while searching, open the matches so the answer is visible straight away
      if (words.length) for (const li of $$('.rows > li', g)) if (!li.hidden) li.querySelector('details').open = true;
    }
    none.hidden = shown > 0;
    count.textContent = shown === guides.length ? `${guides.length} guides` : `${shown} of ${guides.length} guides`;
  }

  let t = 0;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 120); });
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    topic = b.dataset.g;
    for (const c of $$('.chip')) c.setAttribute('aria-pressed', String(c === b));
    apply();
  });
  $('#reset').addEventListener('click', () => {
    q.value = ''; topic = '';
    for (const c of $$('.chip')) c.setAttribute('aria-pressed', String(c.dataset.g === ''));
    apply(); q.focus();
  });

  // A shared link (howto.html#save) opens that guide; a topic link (#money) just scrolls.
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const li = id && document.getElementById(id);
    if (!li || !li.matches('.rows > li')) return;
    li.hidden = false; li.closest('.group').hidden = false;
    li.querySelector('details').open = true;
    li.scrollIntoView({ block: 'start' });
    li.querySelector('summary').focus({ preventScroll: true });
  }
  addEventListener('hashchange', openFromHash);
  openFromHash();

  // Opening a guide puts its link in the address bar, so copying the URL shares that guide.
  for (const li of guides) {
    li.querySelector('details').addEventListener('toggle', (e) => {
      if (e.target.open && !q.value && location.hash !== '#' + li.id) history.replaceState(null, '', '#' + li.id);
    });
  }

  let toastT = 0;
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200);
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.copy'); if (!b) return;
    const li = b.closest('.rows > li');
    const url = location.origin + location.pathname + '#' + li.id;
    try { await navigator.clipboard.writeText(url); toast('Link copied'); }
    catch { history.replaceState(null, '', '#' + li.id); toast('Link is in the address bar'); }
  });

  document.querySelector('.top nav [aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  apply();
})();
