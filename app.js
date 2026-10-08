/* ==========================================================================
   Bolos d' Maitê — app.js
   100% local: IndexedDB (receitas) + localStorage (favoritos, lista, tema).
   Nenhuma requisição externa, nenhum rastreamento, nenhuma notificação.

   Organização:
     1. Utilidades            6. Receitas de exemplo (seed)
     2. Ícones e ilustrações  7. Armazenamento (IndexedDB / localStorage)
     3. Ingredientes e medidas 8. Telas (views)
     4. Conversor             9. Ações, eventos e roteador
     5. Categorias e estado  10. Inicialização
   ========================================================================== */
(() => {
'use strict';

/* ---------- 1. Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const uid = () => 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignora */ } }
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Diálogo simples. actions: [{label, value, kind}] -> Promise<value|null> */
function modal({ title, message, actions }) {
  return new Promise(resolve => {
    const root = $('#modal-root');
    const prev = document.activeElement;
    root.innerHTML = `<div class="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-t">
      <h2 id="m-t">${esc(title)}</h2><p>${esc(message)}</p>
      <div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.kind || 'ghost'}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div></div>`;
    const btns = $$('button', root);
    const close = v => {
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
      resolve(v);
    };
    const onKey = e => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Tab') {
        const i = btns.indexOf(document.activeElement);
        e.preventDefault();
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
      }
    };
    $('.scrim', root).addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (b) close(actions[+b.dataset.i].value);
      else if (e.target.classList.contains('scrim')) close(null);
    });
    document.addEventListener('keydown', onKey);
    btns[0].focus();
  });
}
const confirmBox = (title, message, ok = 'Confirmar', danger = false) =>
  modal({ title, message, actions: [{ label: 'Cancelar', value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] });

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignora */ }
    ta.remove();
    return ok;
  }
}

function downloadFile(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** Reduz a foto escolhida antes de guardar (economiza espaço no aparelho). */
function fileToDataURL(file, max = 900) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
    img.src = url;
  });
}

/* ---------- 2. Ícones e ilustrações ---------- */
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 4-6 7.5-6s6.7 2 7.5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14 8 3 3"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7"/><path d="M10.5 11v5M13.5 11v5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  share: '<circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="6" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2.5"/><path d="M7 14h10v6H7z"/>',
  cart: '<path d="M3.5 5h2.2l2 10h9.6l1.8-7.5H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.4 3.2-5 6-5s5.4 1.6 6 5"/><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6M17.5 14.8c1.9.5 3.2 2 3.5 4.7"/>',
  hat: '<path d="M7 14.5V19h10v-4.5"/><path d="M7.5 14.5A4 4 0 0 1 8 6.6a4.2 4.2 0 0 1 8 0 4 4 0 0 1 .5 7.9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  back: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5Z"/><path d="M5 5.5v15M9 7.5h6"/>',
  scale: '<path d="M12 4v16M6 20h12M5 7.5h14"/><path d="m5 7.5-2.5 6a3 3 0 0 0 5 0Zm14 0-2.5 6a3 3 0 0 0 5 0Z"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  refresh: '<path d="M19.5 12A7.5 7.5 0 1 1 17 6.4M19.5 4.5v4h-4"/>'
};
const ic = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[n] || ''}</svg>`;

const TONES = {
  choc: ['#8a5a44', '#5f3a2b'], vanilla: ['#f7dca4', '#efc77e'], pink: ['#f6b3c3', '#ec93a9'],
  orange: ['#f2a766', '#e58c45'], lemon: ['#f6e385', '#e8cf55'], caramel: ['#d9a566', '#b9824a']
};
const DEFAULT_TONE = { bolos: 'pink', cupcakes: 'vanilla', cookies: 'caramel', doces: 'choc', tortas: 'pink', sobremesas: 'vanilla', faceis: 'pink' };

const berry = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-12C-10-12-12-2-7 6Q0 14 7 6C12-2 10-12 0-12Z" fill="#e0556f"/><path d="M-6-12 0-17 6-12 0-9Z" fill="#7fb38a"/><g fill="#fde7ec"><circle cx="-3" cy="-2" r=".9"/><circle cx="3" cy="-3" r=".9"/><circle cx="0" cy="3" r=".9"/></g></g>`;
const sparkles = '<g fill="#fff" opacity=".8"><circle cx="24" cy="28" r="2.2"/><circle cx="170" cy="40" r="1.8"/><circle cx="34" cy="116" r="1.6"/><circle cx="176" cy="108" r="2.4"/><circle cx="150" cy="18" r="1.4"/></g>';

/** Ilustração vetorial local para quando a receita não tem foto. */
function art(cat, tone) {
  const [a, b] = TONES[tone] || TONES[DEFAULT_TONE[cat]] || TONES.pink;
  const plate = '<ellipse cx="100" cy="126" rx="70" ry="9" fill="#fff" opacity=".85"/>';
  const scenes = {
    bolos: `${plate}<path d="M54 72h92v42q-46 10-92 0z" fill="${a}"/><path d="M54 88h92v8H54z" fill="#fff6e8"/><path d="M54 102h92v3H54z" fill="${b}" opacity=".35"/>
      <path d="M48 72Q48 56 66 56H134Q152 56 152 72Q152 82 142 82Q138 94 132 82Q124 86 118 80Q110 94 102 80Q92 88 86 80Q78 94 70 80Q58 86 56 80Q48 82 48 72Z" fill="#fde7ec"/>${berry(100, 50, 1.25)}${berry(74, 60, .7)}${berry(126, 60, .7)}`,
    cupcakes: `${plate}<path d="M64 88H136L128 124H72Z" fill="#ffdcca"/><path d="M80 88L84 124M100 88V124M120 88L116 124" stroke="#fff" stroke-width="3" opacity=".7"/>
      <ellipse cx="100" cy="88" rx="38" ry="8" fill="${a}"/><ellipse cx="100" cy="78" rx="36" ry="12" fill="#fde7ec"/><ellipse cx="100" cy="64" rx="26" ry="11" fill="#f9d3dc"/><ellipse cx="100" cy="52" rx="16" ry="9" fill="#fde7ec"/>
      <circle cx="100" cy="42" r="7" fill="#d6455f"/><path d="M100 36q4-8 9-9" stroke="#7fb38a" stroke-width="2" fill="none"/>
      <g fill="#d3e8f6"><rect x="80" y="74" width="7" height="2.6" rx="1.3" transform="rotate(25 83 75)"/><rect x="112" y="70" width="7" height="2.6" rx="1.3" transform="rotate(-30 115 71)"/></g><g fill="#e6dcf7"><rect x="96" y="80" width="7" height="2.6" rx="1.3"/><rect x="92" y="62" width="6" height="2.4" rx="1.2" transform="rotate(40 95 63)"/></g>`,
    cookies: `<circle cx="132" cy="92" r="32" fill="${b}"/><circle cx="132" cy="90" r="30" fill="${a}"/><g fill="#5f3a2b"><ellipse cx="120" cy="82" rx="4.5" ry="3.4"/><ellipse cx="140" cy="96" rx="5" ry="3.4"/><ellipse cx="128" cy="104" rx="3.6" ry="3"/><ellipse cx="146" cy="80" rx="3.6" ry="3"/></g>
      <circle cx="82" cy="78" r="44" fill="${b}"/><circle cx="82" cy="75" r="42" fill="${a}"/><g fill="#5f3a2b"><ellipse cx="66" cy="62" rx="6" ry="4.4"/><ellipse cx="94" cy="58" rx="5" ry="3.8"/><ellipse cx="100" cy="82" rx="6" ry="4.4" transform="rotate(30 100 82)"/><ellipse cx="72" cy="88" rx="5.5" ry="4"/><ellipse cx="86" cy="100" rx="4.4" ry="3.4"/><ellipse cx="58" cy="78" rx="4" ry="3"/></g>`,
    doces: `${plate}${[58, 100, 142].map((x, i) => `<circle cx="${x}" cy="88" r="22" fill="${i === 1 ? b : a}"/><g fill="#fff"><circle cx="${x - 9}" cy="80" r="1.8"/><circle cx="${x + 6}" cy="76" r="1.8" fill="#f6c9d4"/><circle cx="${x + 11}" cy="90" r="1.8" fill="#d3e8f6"/><circle cx="${x - 4}" cy="94" r="1.8" fill="#f6c9d4"/><circle cx="${x + 1}" cy="84" r="1.6"/></g>
      <path d="M${x - 20} 100L${x + 20} 100L${x + 15} 122L${x - 15} 122Z" fill="#f4c6d0"/><path d="M${x - 10} 100L${x - 7} 122M${x} 100V122M${x + 10} 100L${x + 7} 122" stroke="#fff" stroke-width="2" opacity=".6"/>`).join('')}`,
    tortas: `${plate}<ellipse cx="100" cy="100" rx="76" ry="28" fill="#e2b87c"/><ellipse cx="100" cy="95" rx="66" ry="23" fill="${a}"/><ellipse cx="100" cy="95" rx="58" ry="18" fill="#fff6e8" opacity=".55"/>
      ${berry(100, 86, 1.1)}${berry(72, 92, 1)}${berry(128, 92, 1)}${berry(86, 106, .95)}${berry(114, 106, .95)}<g fill="#fff"><circle cx="62" cy="80" r="4"/><circle cx="140" cy="80" r="4"/><circle cx="100" cy="72" r="4"/></g>`,
    sobremesas: `${plate}<ellipse cx="100" cy="122" rx="48" ry="7" fill="#b66f33" opacity=".85"/><path d="M64 120Q66 70 100 66Q134 70 136 120Z" fill="${a}"/><path d="M68 92Q100 52 132 92Q124 102 118 92Q110 106 102 94Q94 106 86 94Q78 104 68 92Z" fill="#b66f33"/><ellipse cx="88" cy="76" rx="5" ry="9" fill="#fff" opacity=".35" transform="rotate(20 88 76)"/>${berry(100, 56, .8)}`,
    faceis: `<path d="M64 46H136L127 124Q100 132 73 124Z" fill="#fff" opacity=".6" stroke="#e8c3cc" stroke-width="2"/><path d="M68 72H132L129 104H71Z" fill="${a}"/><path d="M71 104H129L127 122Q100 128 73 122Z" fill="${b}" opacity=".85"/><path d="M68 72Q84 62 100 72T132 72V76H68Z" fill="#fff6e8"/><circle cx="100" cy="52" r="0"/>${berry(100, 56, 1.1)}<ellipse cx="86" cy="86" rx="3" ry="10" fill="#fff" opacity=".35"/>`
  };
  return `<svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${sparkles}${scenes[cat] || scenes.bolos}</svg>`;
}

/* ---------- 3. Ingredientes e medidas ---------- */
const FRAC = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125 };
const UNIT_RULES = [
  [/^colher(?:es)?\s*(?:de\s*)?\(?\s*sopa\s*\)?/iu, 'csopa'],
  [/^colher(?:es)?\s*(?:de\s*)?\(?\s*ch[áa]\s*\)?/iu, 'cchá'],
  [/^x[íi]caras?(?:\s*\(\s*ch[áa]\s*\)|\s+de\s+ch[áa](?![\p{L}]))?/iu, 'xic'],
  [/^ml(?![\p{L}])/iu, 'ml'],
  [/^(?:litros?|l)(?![\p{L}])/iu, 'l'],
  [/^(?:quilos?|kg)(?![\p{L}])/iu, 'kg'],
  [/^(?:gramas?|g)(?![\p{L}])/iu, 'g']
];
const UNIT_LABEL = {
  xic: ['xícara', 'xícaras'], csopa: ['colher de sopa', 'colheres de sopa'], cchá: ['colher de chá', 'colheres de chá'],
  ml: ['ml', 'ml'], l: ['l', 'l'], g: ['g', 'g'], kg: ['kg', 'kg'], '': ['', '']
};
const ML = { xic: 240, csopa: 15, cchá: 5, ml: 1, l: 1000 };

function toNum(s) {
  let t = 0;
  for (const p of s.replace(/([¼½¾⅓⅔⅛])/g, ' $1 ').trim().split(/\s+/).filter(Boolean)) {
    if (FRAC[p]) t += FRAC[p];
    else if (p.includes('/')) { const [x, y] = p.split('/'); t += (+x) / (+y); }
    else t += parseFloat(p.replace(',', '.')) || 0;
  }
  return t;
}

/** "2 xícaras de farinha" -> {qty:2, unit:'xic', name:'farinha'}; "Cobertura:" -> {heading} */
function parseIngredient(line) {
  line = String(line || '').trim();
  if (!line) return null;
  if (/:\s*$/.test(line)) return { heading: line.replace(/:\s*$/, '').trim() };
  const m = line.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[¼½¾⅓⅔⅛]?|[¼½¾⅓⅔⅛])\s*(.*)$/u);
  if (!m) return { qty: null, unit: '', name: line };
  const qty = toNum(m[1]);
  let rest = m[2], unit = '';
  for (const [re, u] of UNIT_RULES) {
    const mm = rest.match(re);
    if (mm) { unit = u; rest = rest.slice(mm[0].length).replace(/^\s*(?:de|d')\s+/i, '').trim(); break; }
  }
  return { qty, unit, name: rest.trim() };
}

function fmtFrac(q) {
  const whole = Math.floor(q + 1e-9), f = q - whole;
  const opts = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
  let best = opts[0], bd = 9;
  for (const o of opts) { const d = Math.abs(f - o[0]); if (d < bd) { bd = d; best = o; } }
  if (bd > 0.04) return String(Math.round(q * 100) / 100).replace('.', ',');
  let w = whole;
  if (best[0] === 1) { w += 1; best = [0, '']; }
  return ((w ? w : '') + (w && best[1] ? ' ' : '') + best[1]) || '0';
}
function fmtMetric(q) {
  if (q >= 100) return String(Math.round(q));
  if (q >= 10) return String(Math.round(q * 10) / 10).replace('.', ',');
  return String(Math.round(q * 100) / 100).replace('.', ',');
}
function normUnit(q, u) {
  if (u === 'g' && q >= 1000) return [q / 1000, 'kg'];
  if (u === 'kg' && q < 1) return [q * 1000, 'g'];
  if (u === 'ml' && q >= 1000) return [q / 1000, 'l'];
  if (u === 'l' && q < 1) return [q * 1000, 'ml'];
  return [q, u];
}

/** Aplica fator de porções (e sistema de medidas) e devolve partes para exibir. */
function scaleIng(ing, factor, system) {
  if (ing.qty == null) return { qty: '', unit: '', name: ing.name, plain: ing.name };
  let q = ing.qty * factor, u = ing.unit;
  if (system === 'metric' && ML[u] && u !== 'ml' && u !== 'l') { q *= ML[u]; u = 'ml'; }
  [q, u] = normUnit(q, u);
  const qtyStr = (u === 'xic' || u === 'csopa' || u === 'cchá' || u === '') ? fmtFrac(q) : fmtMetric(q);
  const lab = UNIT_LABEL[u] ? UNIT_LABEL[u][q > 1.0001 ? 1 : 0] : '';
  const name = ing.name;
  const left = lab ? `${qtyStr} ${lab}` : qtyStr;
  const plain = `${left}${name ? (lab ? ' de ' : ' ') + name : ''}`;
  return { qty: left, name: lab && name ? 'de ' + name : name, plain };
}
const ingText = (ing, f, sys) => scaleIng(ing, f, sys).plain;

/** Texto de edição: converte a lista estruturada de volta para linhas. */
const ingredientsToLines = list => list.map(i => i.heading ? i.heading + ':' : ingText(i, 1, 'orig')).join('\n');

const fmtTime = m => {
  m = +m || 0;
  if (!m) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} h${r ? ' ' + r + ' min' : ''}`;
};
const SINGULAR = { 'porções': 'porção', fatias: 'fatia', unidades: 'unidade', 'taças': 'taça', potes: 'pote' };
const yieldText = (n, label) => `${n} ${n === 1 ? (SINGULAR[label] || label) : label}`;

/* ---------- 4. Conversor ---------- */
const CONV_UNITS = {
  xic: { l: 'Xícara (240 ml)', f: 240, k: 'v' }, csopa: { l: 'Colher de sopa (15 ml)', f: 15, k: 'v' },
  cchá: { l: 'Colher de chá (5 ml)', f: 5, k: 'v' }, ml: { l: 'Mililitro (ml)', f: 1, k: 'v' },
  l: { l: 'Litro (l)', f: 1000, k: 'v' }, g: { l: 'Grama (g)', f: 1, k: 'm' }, kg: { l: 'Quilo (kg)', f: 1000, k: 'm' }
};
// gramas por xícara (240 ml) — valores aproximados de uso comum
const DENSITY = [
  ['Farinha de trigo', 120], ['Açúcar refinado', 180], ['Açúcar mascavo', 150], ['Chocolate em pó', 90],
  ['Amido de milho', 130], ['Fubá', 130], ['Manteiga', 200], ['Mel', 340], ['Leite ou água', 240],
  ['Óleo', 220], ['Coco ralado', 80], ['Aveia em flocos', 80]
];
function convert(v, from, to, dens) {
  const a = CONV_UNITS[from], b = CONV_UNITS[to];
  if (a.k === b.k) return v * a.f / b.f;
  if (!dens) return null;
  if (a.k === 'v') return (v * a.f / 240 * dens) / b.f;
  return ((v * a.f) / dens * 240) / b.f;
}

/* ---------- 5. Categorias e estado ---------- */
const CATEGORIES = [
  { id: 'bolos', label: 'Bolos', emoji: '🍰' }, { id: 'cupcakes', label: 'Cupcakes', emoji: '🧁' },
  { id: 'cookies', label: 'Cookies', emoji: '🍪' }, { id: 'doces', label: 'Doces', emoji: '🍫' },
  { id: 'tortas', label: 'Tortas', emoji: '🥧' }, { id: 'sobremesas', label: 'Sobremesas', emoji: '🍮' },
  { id: 'faceis', label: 'Doces fáceis', emoji: '🍓' }
];
const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[3];
const DIFFS = ['Fácil', 'Média', 'Difícil'];

const S = {
  recipes: [],
  fav: new Set(LS.get('bdm_fav', [])),
  shop: LS.get('bdm_shop', []),
  settings: Object.assign({ theme: 'auto' }, LS.get('bdm_settings', {})),
  filters: { q: '', cat: '', time: '', diff: '', favOnly: false },
  scale: { id: null, n: 1, system: 'orig', got: new Set(), done: new Set() },
  formPhoto: null,
  focusSearch: false,
  view: ''
};
const byId = id => S.recipes.find(r => r.id === id);
const saveFav = () => LS.set('bdm_fav', [...S.fav]);
const saveShop = () => LS.set('bdm_shop', S.shop);
const saveSettings = () => LS.set('bdm_settings', S.settings);

/* ---------- 6. Receitas de exemplo ---------- */
const SEED = [
  {
    id: 'seed-bolo-cenoura', name: 'Bolo de cenoura com cobertura de chocolate', category: 'bolos', tone: 'orange', time: 60, n: 12, label: 'fatias', diff: 'Fácil', featured: true,
    tags: ['clássico', 'cenoura', 'chocolate', 'fácil'], desc: 'O bolo fofinho de todo café da tarde, com a cobertura brilhante que escorre pelas bordas.',
    ing: ['Massa:', '3 cenouras médias (cerca de 300 g), descascadas e picadas', '4 ovos', '1 xícara de óleo', '2 xícaras de açúcar', '2 xícaras de farinha de trigo', '1 colher de sopa de fermento em pó', 'Cobertura:', '3 colheres de sopa de chocolate em pó', '2 colheres de sopa de manteiga', '1 xícara de açúcar', '1/2 xícara de leite'],
    steps: ['Preaqueça o forno a 180 °C e unte uma forma de 24 cm com manteiga e farinha.', 'No liquidificador, bata as cenouras, os ovos e o óleo até obter um creme liso, sem pedaços.', 'Acrescente o açúcar e bata por mais 1 minuto.', 'Transfira para uma tigela e misture a farinha peneirada aos poucos.', 'Adicione o fermento e misture delicadamente, só até incorporar.', 'Despeje na forma e asse por cerca de 40 minutos, até o palito sair limpo.', 'Para a cobertura, leve todos os ingredientes ao fogo médio, mexendo sempre, até ferver e engrossar levemente (3 a 4 minutos).', 'Espalhe a cobertura sobre o bolo ainda morno e deixe firmar antes de servir.'],
    tips: 'Bata bem a cenoura para não ficarem fibras na massa.\nA cobertura engrossa ao esfriar; se endurecer demais, aqueça por alguns segundos.'
  },
  {
    id: 'seed-bolo-fuba', name: 'Bolo de fubá macio', category: 'bolos', tone: 'lemon', time: 55, n: 10, label: 'fatias', diff: 'Fácil',
    tags: ['fubá', 'café da tarde', 'fácil'], desc: 'Simples, perfumado e perfeito para acompanhar um café quentinho.',
    ing: ['2 xícaras de leite', '1 xícara de fubá', '1 xícara de açúcar', '1/2 xícara de óleo', '3 ovos', '1/2 xícara de farinha de trigo', '1 colher de sopa de fermento em pó', '1 colher de chá de erva-doce (opcional)'],
    steps: ['Preaqueça o forno a 180 °C e unte uma forma com furo central.', 'No liquidificador, bata o leite, o fubá, o açúcar, o óleo e os ovos por 2 minutos.', 'Junte a farinha de trigo e bata mais 1 minuto.', 'Adicione o fermento e a erva-doce e misture com uma colher.', 'Despeje na forma e asse por cerca de 40 minutos.', 'Espere amornar antes de desenformar.'],
    tips: 'Deixe a massa descansar 10 minutos antes de assar para o fubá hidratar.'
  },
  {
    id: 'seed-bolo-chocolate', name: 'Bolo de chocolate fofinho', category: 'bolos', tone: 'choc', time: 70, n: 12, label: 'fatias', diff: 'Fácil', featured: true,
    tags: ['chocolate', 'brigadeiro', 'festa'], desc: 'Massa úmida de chocolate coberta com brigadeiro cremoso.',
    ing: ['Massa:', '3 ovos', '1 1/2 xícara de açúcar', '1/2 xícara de óleo', '1 xícara de leite', '3/4 xícara de chocolate em pó', '2 xícaras de farinha de trigo', '1 colher de sopa de fermento em pó', 'Cobertura:', '1 lata de leite condensado', '3 colheres de sopa de chocolate em pó', '1 colher de sopa de manteiga', '100 g de creme de leite'],
    steps: ['Preaqueça o forno a 180 °C e unte uma forma de 24 cm.', 'No liquidificador, bata os ovos, o açúcar, o óleo, o leite e o chocolate em pó até ficar homogêneo.', 'Transfira para uma tigela e misture a farinha peneirada.', 'Junte o fermento e misture delicadamente.', 'Asse por cerca de 40 minutos, até o palito sair limpo.', 'Cobertura: em fogo baixo, mexa o leite condensado, o chocolate e a manteiga até desgrudar do fundo da panela.', 'Fora do fogo, misture o creme de leite e espalhe sobre o bolo morno.'],
    tips: 'Peneirar o chocolate em pó evita grumos.\nPara um bolo mais úmido, troque o leite por café coado morno.'
  },
  {
    id: 'seed-cupcake-baunilha', name: 'Cupcake de baunilha com chantilly', category: 'cupcakes', tone: 'vanilla', time: 50, n: 12, label: 'unidades', diff: 'Média', featured: true,
    tags: ['chantilly', 'baunilha', 'festa'], desc: 'Massa amanteigada com chantilly fresquinho e um morango por cima.',
    ing: ['Massa:', '2 xícaras de farinha de trigo', '1 xícara de açúcar', '100 g de manteiga sem sal em temperatura ambiente', '3 ovos', '1 xícara de leite', '1 colher de sopa de essência de baunilha', '1 colher de sopa de fermento em pó', 'Chantilly:', '200 g de creme de leite fresco gelado', '3 colheres de sopa de açúcar de confeiteiro', '1 colher de chá de essência de baunilha', 'Para decorar:', '6 morangos', 'Confeitos a gosto'],
    steps: ['Preaqueça o forno a 180 °C e forre uma forma de muffins com forminhas.', 'Bata a manteiga com o açúcar até ficar clara e cremosa.', 'Junte os ovos um a um, depois a baunilha.', 'Alterne a farinha misturada ao fermento e o leite, mexendo só até incorporar.', 'Encha 2/3 de cada forminha e asse por 20 a 25 minutos.', 'Deixe esfriar completamente.', 'Bata o creme de leite gelado com o açúcar de confeiteiro e a baunilha até ponto firme.', 'Decore com bico pitanga, meio morango e confeitos.'],
    tips: 'O creme de leite fresco e a tigela precisam estar bem gelados para o chantilly firmar.\nGuarde na geladeira e consuma em até 24 horas.'
  },
  {
    id: 'seed-cupcake-chocolate', name: 'Cupcake de chocolate com ganache', category: 'cupcakes', tone: 'choc', time: 45, n: 10, label: 'unidades', diff: 'Fácil',
    tags: ['chocolate', 'ganache'], desc: 'Massinha úmida de chocolate com cobertura brilhante de ganache.',
    ing: ['Massa:', '1 xícara de farinha de trigo', '1/2 xícara de chocolate em pó', '1 xícara de açúcar', '1/2 xícara de óleo', '2 ovos', '1/2 xícara de leite', '2 colheres de chá de fermento em pó', 'Ganache:', '150 g de chocolate meio amargo picado', '150 g de creme de leite'],
    steps: ['Preaqueça o forno a 180 °C e coloque forminhas na forma de muffins.', 'Misture os ingredientes secos, depois junte os ovos, o óleo e o leite.', 'Mexa até ficar liso, acrescentando o fermento por último.', 'Encha 2/3 das forminhas e asse por 20 a 25 minutos.', 'Aqueça o creme de leite até quase ferver e despeje sobre o chocolate picado.', 'Espere 2 minutos e mexa até ficar liso. Deixe firmar por cerca de 20 minutos.', 'Cubra os cupcakes frios com a ganache.'],
    tips: 'Para uma ganache mais brilhante, mexa devagar, sem bater.'
  },
  {
    id: 'seed-cookies', name: 'Cookies de gotas de chocolate', category: 'cookies', tone: 'caramel', time: 35, n: 20, label: 'unidades', diff: 'Fácil', featured: true,
    tags: ['gotas de chocolate', 'crocante', 'fácil'], desc: 'Bordas douradas, centro macio e muito chocolate em cada mordida.',
    ing: ['200 g de manteiga sem sal amolecida', '3/4 xícara de açúcar mascavo', '1/2 xícara de açúcar', '1 ovo', '1 colher de chá de essência de baunilha', '2 1/4 xícaras de farinha de trigo', '1/2 colher de chá de bicarbonato de sódio', '1 pitada de sal', '200 g de gotas de chocolate'],
    steps: ['Preaqueça o forno a 180 °C e forre uma assadeira com papel manteiga.', 'Bata a manteiga com os dois açúcares até formar um creme claro.', 'Junte o ovo e a baunilha.', 'Misture a farinha, o bicarbonato e o sal e acrescente à massa.', 'Incorpore as gotas de chocolate.', 'Modele bolinhas, distribua na assadeira com espaço entre elas e achate levemente.', 'Asse por 10 a 12 minutos, até as bordas dourarem.', 'Deixe esfriar 5 minutos na assadeira antes de transferir.'],
    tips: 'Gele a massa por 30 minutos para cookies mais grossos.\nO centro endurece ao esfriar, então tire do forno quando ainda estiver macio.'
  },
  {
    id: 'seed-brigadeiro', name: 'Brigadeiro tradicional', category: 'doces', tone: 'choc', time: 25, n: 30, label: 'unidades', diff: 'Fácil', featured: true,
    tags: ['festa', 'clássico', 'fácil'], desc: 'O doce de festa que todo mundo ama, com ponto perfeito de enrolar.',
    ing: ['1 lata de leite condensado', '1 colher de sopa de manteiga', '3 colheres de sopa de chocolate em pó', 'Chocolate granulado para enrolar', 'Manteiga para untar as mãos'],
    steps: ['Em uma panela de fundo grosso, misture o leite condensado, a manteiga e o chocolate em pó.', 'Cozinhe em fogo baixo, mexendo sem parar, por 10 a 12 minutos, até aparecer o fundo da panela ao passar a colher.', 'Despeje em um prato untado e deixe esfriar completamente.', 'Unte as mãos com manteiga, enrole bolinhas e passe no granulado.', 'Coloque em forminhas de papel.'],
    tips: 'Se a massa estiver mole, volte à panela por mais 1 ou 2 minutos.'
  },
  {
    id: 'seed-beijinho', name: 'Beijinho de coco', category: 'doces', tone: 'vanilla', time: 30, n: 30, label: 'unidades', diff: 'Fácil',
    tags: ['coco', 'festa', 'fácil'], desc: 'Docinho cremoso de coco com um cravo no topo.',
    ing: ['1 lata de leite condensado', '1 colher de sopa de manteiga', '1 xícara de coco ralado', 'Coco ralado para enrolar', 'Açúcar cristal para enrolar', 'Cravos-da-índia para decorar'],
    steps: ['Em uma panela, misture o leite condensado, a manteiga e o coco ralado.', 'Cozinhe em fogo baixo, mexendo sempre, até desgrudar do fundo da panela.', 'Despeje em um prato untado e deixe esfriar.', 'Enrole bolinhas e passe no coco ralado ou no açúcar cristal.', 'Finalize com um cravo no centro de cada docinho.'],
    tips: 'Passe no açúcar cristal para um brilho de confeitaria.'
  },
  {
    id: 'seed-torta-limao', name: 'Torta de limão com merengue', category: 'tortas', tone: 'lemon', time: 60, n: 10, label: 'fatias', diff: 'Média',
    tags: ['limão', 'merengue', 'gelada'], desc: 'Base crocante, recheio cremoso e merengue dourado.',
    ing: ['Base:', '200 g de biscoito maisena', '100 g de manteiga derretida', 'Recheio:', '1 lata de leite condensado', '1 caixinha de creme de leite (200 g)', '1/2 xícara de suco de limão', 'Raspas de 1 limão', 'Merengue:', '3 claras', '6 colheres de sopa de açúcar'],
    steps: ['Preaqueça o forno a 180 °C.', 'Triture os biscoitos, misture com a manteiga e pressione no fundo e nas laterais de uma forma de fundo removível de 22 cm. Asse por 10 minutos.', 'Misture o leite condensado, o creme de leite, o suco e as raspas de limão até ficar liso e encorpado.', 'Despeje o recheio sobre a base.', 'Bata as claras em neve, juntando o açúcar aos poucos, até ficar firme e brilhante.', 'Cubra a torta com o merengue e leve ao forno a 200 °C por 8 a 10 minutos, ou use um maçarico.', 'Gele por pelo menos 4 horas antes de servir.'],
    tips: 'Evite a parte branca da casca do limão: ela amarga.\nGelada fica mais fácil de fatiar.'
  },
  {
    id: 'seed-torta-morango', name: 'Torta de morango com creme', category: 'tortas', tone: 'pink', time: 60, n: 10, label: 'fatias', diff: 'Média', featured: true,
    tags: ['morango', 'creme', 'festa'], desc: 'Creme de baunilha sedoso sobre base crocante, coberta de morangos brilhantes.',
    ing: ['Base:', '200 g de biscoito maisena', '100 g de manteiga derretida', 'Creme:', '1 lata de leite condensado', '300 ml de leite', '2 gemas', '2 colheres de sopa de amido de milho', '1 colher de chá de essência de baunilha', '1 caixinha de creme de leite (200 g)', 'Cobertura:', '400 g de morangos lavados', '3 colheres de sopa de geleia de morango'],
    steps: ['Triture os biscoitos, misture com a manteiga e forre uma forma de fundo removível de 22 cm.', 'Em uma panela, misture o leite condensado, o leite, as gemas peneiradas e o amido dissolvido.', 'Cozinhe em fogo médio, mexendo sempre, até engrossar.', 'Desligue, junte a baunilha e deixe esfriar. Misture o creme de leite.', 'Despeje sobre a base e leve à geladeira por 3 horas.', 'Fatie os morangos e distribua sobre o creme.', 'Aqueça a geleia por 20 segundos e pincele sobre os morangos.'],
    tips: 'Seque bem os morangos depois de lavar para não soltarem água no creme.'
  },
  {
    id: 'seed-pudim', name: 'Pudim de leite condensado', category: 'sobremesas', tone: 'vanilla', time: 80, n: 10, label: 'fatias', diff: 'Média',
    tags: ['clássico', 'caramelo', 'gelada'], desc: 'Cremoso, sem furinhos e com calda de caramelo brilhante.',
    ing: ['Calda:', '1 xícara de açúcar', '1/2 xícara de água quente', 'Pudim:', '1 lata de leite condensado', '1 1/2 xícara de leite integral', '3 ovos'],
    steps: ['Preaqueça o forno a 180 °C.', 'Derreta o açúcar em uma panela em fogo médio, até dourar. Junte a água quente com cuidado, pois espirra, e mexa até dissolver.', 'Despeje a calda em uma forma de pudim com furo central e gire para cobrir o fundo e as laterais.', 'Bata no liquidificador o leite condensado, o leite e os ovos por poucos segundos, sem fazer espuma.', 'Coe e despeje na forma.', 'Cubra com papel-alumínio e asse em banho-maria por 50 a 60 minutos.', 'Espere esfriar e leve à geladeira por pelo menos 6 horas antes de desenformar.'],
    tips: 'Bater pouco evita bolhinhas e furos no pudim.\nPasse uma faca fina nas bordas antes de desenformar.\nO tempo de geladeira (6 horas) não está incluído no tempo de preparo.'
  },
  {
    id: 'seed-mousse-maracuja', name: 'Mousse de maracujá', category: 'faceis', tone: 'lemon', time: 10, n: 6, label: 'taças', diff: 'Fácil',
    tags: ['maracujá', 'gelada', 'fácil', 'liquidificador'], desc: 'Três ingredientes, um liquidificador e uma sobremesa de restaurante.',
    ing: ['1 lata de leite condensado', '1 caixinha de creme de leite (200 g)', '1/2 xícara de suco concentrado de maracujá', 'Sementes de maracujá para decorar'],
    steps: ['Bata no liquidificador o leite condensado, o creme de leite e o suco de maracujá por 1 minuto.', 'Distribua em taças.', 'Leve à geladeira por pelo menos 4 horas.', 'Decore com as sementes de maracujá na hora de servir.'],
    tips: 'Prove a mistura antes de gelar: se quiser mais azedinho, junte mais suco.'
  },
  {
    id: 'seed-bolo-caneca', name: 'Bolo de caneca de chocolate', category: 'faceis', tone: 'choc', time: 5, n: 1, label: 'porções', diff: 'Fácil',
    tags: ['micro-ondas', 'rápido', 'fácil', 'chocolate'], desc: 'Bolinho quentinho de chocolate pronto em menos de 5 minutos.',
    ing: ['4 colheres de sopa de farinha de trigo', '3 colheres de sopa de açúcar', '2 colheres de sopa de chocolate em pó', '1 ovo', '3 colheres de sopa de leite', '2 colheres de sopa de óleo', '1/2 colher de chá de fermento em pó', '1 colher de sopa de gotas de chocolate'],
    steps: ['Em uma caneca grande, misture a farinha, o açúcar e o chocolate em pó.', 'Junte o ovo, o leite e o óleo e mexa até ficar liso.', 'Acrescente o fermento e as gotas de chocolate.', 'Leve ao micro-ondas em potência alta por 1 minuto e 30 segundos a 2 minutos.', 'Espere 1 minuto antes de comer: a caneca fica quente.'],
    tips: 'Cada micro-ondas é diferente. Comece com 1 minuto e 30 segundos e acrescente tempo aos poucos.'
  }
];

function seedToRecipe(s, i) {
  const now = Date.now();
  return {
    id: s.id, name: s.name, category: s.category, description: s.desc, time: s.time,
    yield: { n: s.n, label: s.label }, difficulty: s.diff, ingredients: s.ing.map(parseIngredient).filter(Boolean),
    steps: s.steps, tips: s.tips || '', tags: s.tags || [], photo: null, tone: s.tone, featured: !!s.featured,
    createdAt: now - i * 3600000, updatedAt: now, source: 'base'
  };
}

/* ---------- 7. Armazenamento ---------- */
const DB = (() => {
  const NAME = 'bolos-d-maite', STORE = 'recipes', KEY = 'bdm_recipes';
  let db = null, fallback = false;
  const lsAll = () => LS.get(KEY, []);

  function open() {
    return new Promise(res => {
      if (!('indexedDB' in window)) { fallback = true; return res(); }
      let req;
      try { req = indexedDB.open(NAME, 1); } catch { fallback = true; return res(); }
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => { db = req.result; res(); };
      req.onerror = () => { fallback = true; res(); };
    });
  }
  const tx = (mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => res(r && r.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
  return {
    open,
    getAll: () => fallback ? Promise.resolve(lsAll()) : tx('readonly', s => s.getAll()),
    put(r) {
      if (fallback) { const a = lsAll(), i = a.findIndex(x => x.id === r.id); i >= 0 ? a[i] = r : a.push(r); LS.set(KEY, a); return Promise.resolve(); }
      return tx('readwrite', s => s.put(r));
    },
    bulkPut(list) {
      if (fallback) { const a = lsAll(); list.forEach(r => { const i = a.findIndex(x => x.id === r.id); i >= 0 ? a[i] = r : a.push(r); }); LS.set(KEY, a); return Promise.resolve(); }
      return tx('readwrite', s => { list.forEach(r => s.put(r)); });
    },
    remove(id) {
      if (fallback) { LS.set(KEY, lsAll().filter(x => x.id !== id)); return Promise.resolve(); }
      return tx('readwrite', s => s.delete(id));
    },
    clear() {
      if (fallback) { LS.del(KEY); return Promise.resolve(); }
      return tx('readwrite', s => s.clear());
    }
  };
})();

/** Valida receitas vindas de um backup (nunca confie em arquivo de fora). */
function sanitizeRecipe(x) {
  if (!x || typeof x !== 'object') return null;
  const name = String(x.name || '').trim().slice(0, 160);
  if (!name) return null;
  const ings = (Array.isArray(x.ingredients) ? x.ingredients : []).map(i => {
    if (!i || typeof i !== 'object') return null;
    if (i.heading) return { heading: String(i.heading).slice(0, 80) };
    const nm = String(i.name || '').slice(0, 200);
    if (!nm && i.qty == null) return null;
    const q = i.qty == null || !isFinite(+i.qty) ? null : +i.qty;
    return { qty: q, unit: UNIT_LABEL[i.unit] ? i.unit : '', name: nm };
  }).filter(Boolean);
  const str = a => (Array.isArray(a) ? a : []).map(v => String(v).slice(0, 800)).filter(Boolean);
  return {
    id: String(x.id || uid()).slice(0, 60),
    name,
    category: CATEGORIES.some(c => c.id === x.category) ? x.category : 'doces',
    description: String(x.description || '').slice(0, 600),
    time: Math.max(0, Math.min(5000, +x.time || 0)),
    yield: { n: Math.max(1, Math.min(999, Math.round(+(x.yield && x.yield.n) || 1))), label: String((x.yield && x.yield.label) || 'porções').slice(0, 30) },
    difficulty: DIFFS.includes(x.difficulty) ? x.difficulty : 'Fácil',
    ingredients: ings,
    steps: str(x.steps),
    tips: String(x.tips || '').slice(0, 2000),
    tags: str(x.tags).slice(0, 12),
    photo: typeof x.photo === 'string' && x.photo.startsWith('data:image/') ? x.photo : null,
    tone: TONES[x.tone] ? x.tone : undefined,
    featured: !!x.featured,
    createdAt: +x.createdAt || Date.now(),
    updatedAt: +x.updatedAt || Date.now(),
    source: x.source === 'base' ? 'base' : 'user'
  };
}

/* ---------- 8. Telas ---------- */
const app = () => $('#app');
function mount(html, cls = '') {
  app().innerHTML = `<div class="view ${cls}">${html}</div>`;
}

const artBox = (r, cls = '') => `<div class="art ${cls}" data-cat="${esc(r.category)}">${r.photo ? `<img src="${esc(r.photo)}" alt="Foto de ${esc(r.name)}" loading="lazy">` : art(r.category, r.tone)}</div>`;
const favBtn = id => `<button class="fav-btn" data-action="fav" data-id="${esc(id)}" aria-pressed="${S.fav.has(id)}" aria-label="${S.fav.has(id) ? 'Remover dos favoritos' : 'Favoritar'}">${ic('heart')}</button>`;
const card = r => `<article class="card"><a class="card-link" href="#/receita/${esc(r.id)}">${artBox(r)}<div class="card-body"><h3>${esc(r.name)}</h3><div class="meta"><span>${ic('clock')}${fmtTime(r.time)}</span><span>${ic('hat')}${esc(r.difficulty)}</span></div></div></a>${favBtn(r.id)}</article>`;
const emptyBox = (title, text, btn) => `<div class="empty"><div class="art-sm art" data-cat="bolos">${art('bolos')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn || ''}</div>`;

function viewHome() {
  const featured = S.recipes.filter(r => r.featured).slice(0, 8);
  const favs = S.recipes.filter(r => S.fav.has(r.id));
  const recent = [...S.recipes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const pending = S.shop.filter(i => !i.done).length;
  mount(`
    <section class="hero">
      <h1 class="logo">Bolos d' Maitê<small>caderno de receitas</small></h1>
      <p class="tagline">Receitas feitas para adoçar seus momentos.</p>
      <label class="search">${ic('search')}<span class="sr-only">Buscar receitas</span>
        <input id="home-search" type="search" placeholder="O que você quer preparar hoje?" autocomplete="off"></label>
    </section>
    <nav class="cats" aria-label="Categorias">${CATEGORIES.map(c => `<a class="cat-pill" href="#/buscar?cat=${c.id}"><span class="bubble" aria-hidden="true">${c.emoji}</span>${esc(c.label)}</a>`).join('')}</nav>
    <div class="shortcuts">
      <a class="shortcut" href="#/nova"><span class="dot">${ic('plus')}</span><span>Nova receita<small>Escreva a sua</small></span></a>
      <a class="shortcut" href="#/compras"><span class="dot">${ic('cart')}</span><span>Lista de compras<small>${pending ? pending + (pending === 1 ? ' item' : ' itens') : 'Vazia por enquanto'}</small></span></a>
    </div>
    <div class="section-title"><h2>Receitas em destaque</h2></div>
    ${featured.length ? `<div class="rail">${featured.map(card).join('')}</div>` : emptyBox('Sem destaques', 'Restaure as receitas originais no Perfil para ver os destaques.')}
    <div class="section-title"><h2>Suas favoritas</h2>${favs.length ? '<a href="#/favoritos">Ver todas</a>' : ''}</div>
    ${favs.length ? `<div class="rail">${favs.slice(0, 8).map(card).join('')}</div>` : emptyBox('Nada favoritado ainda', 'Toque no coração de uma receita para guardá-la aqui.')}
    <div class="section-title"><h2>Adicionadas recentemente</h2></div>
    <div class="grid">${recent.map(card).join('')}</div>`, 'flush');
}

function viewCategories() {
  mount(`<h1 class="page-title">Categorias</h1><p class="page-sub">Escolha o que vai sair do forno hoje.</p>
    <div class="grid">${CATEGORIES.map(c => {
      const n = S.recipes.filter(r => inCategory(r, c.id)).length;
      return `<a class="cat-tile" href="#/buscar?cat=${c.id}"><div class="art" data-cat="${c.id}">${art(c.id)}</div><div class="t"><strong>${c.emoji} ${esc(c.label)}</strong><span>${n} ${n === 1 ? 'receita' : 'receitas'}</span></div></a>`;
    }).join('')}</div>`);
}

function inCategory(r, cat) {
  if (!cat) return true;
  if (cat === 'faceis') return r.category === 'faceis' || r.tags.some(t => norm(t) === 'facil');
  return r.category === cat;
}

function searchRecipes(f) {
  const tokens = norm(f.q).split(/\s+/).filter(Boolean);
  const res = S.recipes.filter(r => {
    if (!inCategory(r, f.cat)) return false;
    if (f.time === '30' && !(r.time && r.time <= 30)) return false;
    if (f.time === '60' && !(r.time && r.time <= 60)) return false;
    if (f.time === '61' && !(r.time > 60)) return false;
    if (f.diff && r.difficulty !== f.diff) return false;
    if (f.favOnly && !S.fav.has(r.id)) return false;
    if (!tokens.length) return true;
    const hay = norm([r.name, catOf(r.category).label, r.tags.join(' '), r.description, r.ingredients.map(i => i.name || i.heading).join(' ')].join(' '));
    return tokens.every(t => hay.includes(t));
  });
  if (tokens.length) {
    const score = r => tokens.reduce((s, t) => s + (norm(r.name).includes(t) ? 3 : 0) + (r.tags.some(x => norm(x).includes(t)) ? 2 : 0), 0);
    res.sort((a, b) => score(b) - score(a));
  } else res.sort((a, b) => b.createdAt - a.createdAt);
  return res;
}

function viewSearch(params) {
  if (params.has('cat')) S.filters = { q: '', cat: params.get('cat'), time: '', diff: '', favOnly: false };
  if (params.has('q')) S.filters = { q: params.get('q'), cat: '', time: '', diff: '', favOnly: false };
  const f = S.filters;
  mount(`<h1 class="page-title">Buscar</h1>
    <label class="search">${ic('search')}<span class="sr-only">Buscar por nome, ingrediente, categoria ou tag</span>
      <input id="q" type="search" value="${esc(f.q)}" placeholder="Nome, ingrediente, categoria ou tag" autocomplete="off"></label>
    <div class="filters">
      <select class="select" id="f-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${CATEGORIES.map(c => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${c.emoji} ${esc(c.label)}</option>`).join('')}</select>
      <select class="select" id="f-time" aria-label="Tempo de preparo"><option value="">Qualquer tempo</option><option value="30" ${f.time === '30' ? 'selected' : ''}>Até 30 min</option><option value="60" ${f.time === '60' ? 'selected' : ''}>Até 1 hora</option><option value="61" ${f.time === '61' ? 'selected' : ''}>Mais de 1 hora</option></select>
      <select class="select" id="f-diff" aria-label="Dificuldade"><option value="">Qualquer dificuldade</option>${DIFFS.map(d => `<option ${f.diff === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
      <button class="chip full" id="f-fav" data-action="toggle-fav-filter" aria-pressed="${f.favOnly}">${ic('heart')} Só favoritas</button>
    </div>
    <p class="count" id="count" aria-live="polite"></p>
    <div id="results"></div>`);
  renderResults();
  if (S.focusSearch) { S.focusSearch = false; const q = $('#q'); q.focus(); }
}
function renderResults() {
  const list = searchRecipes(S.filters);
  $('#count').textContent = `${list.length} ${list.length === 1 ? 'receita encontrada' : 'receitas encontradas'}`;
  $('#results').innerHTML = list.length
    ? `<div class="grid">${list.map(card).join('')}</div>`
    : emptyBox('Nada por aqui', 'Tente outro ingrediente ou limpe os filtros.', '<a class="btn soft" href="#/buscar?q=">Limpar busca</a>');
}

function viewFavorites() {
  const list = S.recipes.filter(r => S.fav.has(r.id));
  mount(`<h1 class="page-title">Favoritos</h1><p class="page-sub">As receitas que você mais ama.</p>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : emptyBox('Sua lista está vazia', 'Toque no coração de qualquer receita para guardá-la aqui.', '<a class="btn primary" href="#/categorias">Explorar receitas</a>')}`);
}

/* --- Receita --- */
function ingListHTML(r, f, sys) {
  return r.ingredients.map((i, idx) => {
    if (i.heading) return `<li class="head">${esc(i.heading)}</li>`;
    const p = scaleIng(i, f, sys);
    return `<li data-action="ing-toggle" class="${S.scale.got.has(idx) ? 'got' : ''}" data-i="${idx}"><span class="tx"><span class="q">${esc(p.qty)}</span>${esc(p.name)}</span>
      <button class="mini" data-action="shop-add-one" data-i="${idx}" aria-label="Adicionar à lista de compras: ${esc(p.plain)}">${ic('plus')}</button></li>`;
  }).join('');
}
const scaleChips = r => [['Metade', .5], ['Original', 1], ['Dobro', 2], ['Triplo', 3]].map(([l, k]) => {
  const n = Math.max(1, Math.round(r.yield.n * k));
  return `<button class="chip" data-action="scale-set" data-n="${n}" aria-pressed="${S.scale.n === n}">${l} (${n})</button>`;
}).join('');

function viewRecipe(id) {
  const r = byId(id);
  if (!r) return mount(emptyBox('Receita não encontrada', 'Ela pode ter sido excluída.', '<a class="btn primary" href="#/">Voltar ao início</a>'));
  if (S.scale.id !== id) S.scale = { id, n: r.yield.n, system: 'orig', got: new Set(), done: new Set() };
  const f = S.scale.n / r.yield.n, fav = S.fav.has(id), cat = catOf(r.category);
  const tips = r.tips ? r.tips.split(/\n+/).filter(Boolean) : [];
  mount(`<article>
    <div class="recipe-hero">${artBox(r)}
      <a class="icon-btn back" href="#/" data-action="back" aria-label="Voltar">${ic('back')}</a>${favBtn(id)}</div>
    <div class="recipe-head">
      <a class="crumb" href="#/buscar?cat=${r.category}">${cat.emoji} ${esc(cat.label)}</a>
      <h1>${esc(r.name)}</h1>
      ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ''}
      <div class="facts"><span class="fact">${ic('clock')}${fmtTime(r.time)}</span><span class="fact" id="fact-yield">${ic('users')}<span>${esc(yieldText(S.scale.n, r.yield.label))}</span></span><span class="fact">${ic('hat')}${esc(r.difficulty)}</span></div>
      ${r.tags.length ? `<div class="tags">${r.tags.map(t => `<a class="tag" href="#/buscar?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
    </div>
    <div class="actions-bar">
      <button class="act" data-action="fav" data-id="${esc(id)}" aria-pressed="${fav}">${ic('heart')}<span class="lbl">${fav ? 'Favoritada' : 'Favoritar'}</span></button>
      <a class="act" href="#/editar/${esc(id)}">${ic('edit')}<span>Editar</span></a>
      <button class="act" data-action="copy-ing">${ic('copy')}<span>Copiar</span></button>
      <button class="act" data-action="share">${ic('share')}<span>Compartilhar</span></button>
      <button class="act" data-action="print">${ic('print')}<span>Imprimir</span></button>
      <button class="act del" data-action="delete">${ic('trash')}<span>Excluir</span></button>
    </div>
    <div class="recipe-body">
      <div class="col-ing"><section class="panel" aria-labelledby="h-ing"><h2 id="h-ing">Ingredientes</h2>
        <div class="scaler"><div class="row"><label for="scale-n">Rendimento</label>
          <div class="stepper"><button data-action="scale-dec" aria-label="Diminuir porções">${ic('minus')}</button><input id="scale-n" type="number" inputmode="numeric" min="1" max="999" value="${S.scale.n}"><button data-action="scale-inc" aria-label="Aumentar porções">${ic('plus')}</button></div>
          <span>${esc(r.yield.label)}</span></div>
          <div class="chips" id="scale-chips">${scaleChips(r)}</div></div>
        <div class="seg" role="group" aria-label="Sistema de medidas"><button data-action="system" data-v="orig" aria-pressed="${S.scale.system === 'orig'}">Como na receita</button><button data-action="system" data-v="metric" aria-pressed="${S.scale.system === 'metric'}">Tudo em ml e g</button></div>
        <ul class="ing-list" id="ing-list">${ingListHTML(r, f, S.scale.system)}</ul>
        <div class="btn-row"><button class="btn soft small" data-action="shop-add-all">${ic('cart')} Adicionar tudo à lista</button></div>
      </section></div>
      <div><section class="panel" aria-labelledby="h-prep"><h2 id="h-prep">Modo de preparo</h2>
        <ol class="steps">${r.steps.map((s, i) => `<li data-action="step-toggle" data-i="${i}" class="${S.scale.done.has(i) ? 'done' : ''}"><span class="n">${i + 1}</span><p>${esc(s)}</p></li>`).join('')}</ol>
      </section>
      ${tips.length ? `<section class="panel tips" aria-labelledby="h-tips"><h2 id="h-tips">Dicas e observações</h2><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}</div>
    </div></article>`, 'flush');
}

function updateScaleUI() {
  const r = byId(S.scale.id); if (!r) return;
  const f = S.scale.n / r.yield.n;
  $('#ing-list').innerHTML = ingListHTML(r, f, S.scale.system);
  $('#scale-n').value = S.scale.n;
  $('#fact-yield span').textContent = yieldText(S.scale.n, r.yield.label);
  $('#scale-chips').innerHTML = scaleChips(r);
  $$('[data-action="system"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.scale.system));
}

/* --- Formulário --- */
function viewForm(id) {
  const r = id ? byId(id) : null;
  if (id && !r) return mount(emptyBox('Receita não encontrada', 'Ela pode ter sido excluída.', '<a class="btn primary" href="#/">Voltar ao início</a>'));
  S.formPhoto = r ? r.photo : null;
  mount(`<h1 class="page-title">${r ? 'Editar receita' : 'Nova receita'}</h1><p class="page-sub">${r ? 'Ajuste o que quiser. Tudo fica salvo só no seu aparelho.' : 'Anote sua receita no seu caderno. Ela fica salva só no seu aparelho.'}</p>
  <form class="form" id="recipe-form" novalidate data-id="${esc(id || '')}">
    <div class="field"><label for="f-name">Nome da receita</label><input class="input" id="f-name" required maxlength="160" value="${esc(r ? r.name : '')}" placeholder="Ex.: Bolo de laranja da vovó"><div class="err" id="err-name" role="alert"></div></div>
    <div class="field"><span class="lab">Foto</span><div class="photo-pick"><div class="thumb art" id="photo-thumb" data-cat="${r ? esc(r.category) : 'bolos'}"></div>
      <div style="display:grid;gap:8px"><span class="btn ghost small file-btn">${ic('upload')} Escolher foto<input type="file" id="photo-file" accept="image/*" aria-label="Escolher foto da receita"></span>
      <button type="button" class="btn danger small" data-action="photo-remove">Remover foto</button></div></div>
      <div class="hint">Sem foto, usamos uma ilustração da categoria.</div></div>
    <div class="field"><label for="f-desc">Descrição</label><input class="input" id="f-desc" maxlength="600" value="${esc(r ? r.description : '')}" placeholder="Uma frase que dá água na boca"></div>
    <div class="two"><div class="field"><label for="f-cat2">Categoria</label><select class="select" id="f-cat2">${CATEGORIES.map(c => `<option value="${c.id}" ${(r ? r.category : 'bolos') === c.id ? 'selected' : ''}>${c.emoji} ${esc(c.label)}</option>`).join('')}</select></div>
    <div class="field"><label for="f-diff2">Dificuldade</label><select class="select" id="f-diff2">${DIFFS.map(d => `<option ${(r ? r.difficulty : 'Fácil') === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>
    <div class="two"><div class="field"><label for="f-time">Tempo (minutos)</label><input class="input" id="f-time" type="number" inputmode="numeric" min="0" max="5000" value="${r ? r.time : ''}" placeholder="45"></div>
    <div class="field"><label for="f-yn">Rendimento</label><input class="input" id="f-yn" type="number" inputmode="numeric" min="1" max="999" value="${r ? r.yield.n : 8}"></div></div>
    <div class="field"><label for="f-yl">Rendimento em</label><input class="input" id="f-yl" list="yl" value="${esc(r ? r.yield.label : 'porções')}" maxlength="30"><datalist id="yl"><option value="porções"><option value="fatias"><option value="unidades"><option value="taças"><option value="potes"></datalist></div>
    <div class="field"><label for="f-ing">Ingredientes</label><textarea class="input" id="f-ing" rows="8" placeholder="2 xícaras de farinha de trigo&#10;1/2 xícara de açúcar&#10;3 ovos">${esc(r ? ingredientsToLines(r.ingredients) : '')}</textarea>
      <div class="hint">Um ingrediente por linha, com a quantidade na frente. Para separar partes, escreva uma linha terminando com dois pontos, como "Cobertura:".</div><div class="err" id="err-ing" role="alert"></div></div>
    <div class="field"><label for="f-steps">Modo de preparo</label><textarea class="input" id="f-steps" rows="8" placeholder="Misture os ingredientes secos.&#10;Junte os líquidos e mexa.">${esc(r ? r.steps.join('\n') : '')}</textarea><div class="hint">Uma etapa por linha. Nós numeramos para você.</div><div class="err" id="err-steps" role="alert"></div></div>
    <div class="field"><label for="f-tips">Dicas e observações</label><textarea class="input" id="f-tips" rows="3">${esc(r ? r.tips : '')}</textarea></div>
    <div class="field"><label for="f-tags">Tags</label><input class="input" id="f-tags" value="${esc(r ? r.tags.join(', ') : '')}" placeholder="chocolate, festa, fácil"><div class="hint">Separe por vírgula.</div></div>
    <div class="sticky-save"><a class="btn ghost" href="${r ? '#/receita/' + esc(id) : '#/'}">Cancelar</a><button class="btn primary" type="submit">Salvar receita</button></div>
  </form>`);
  refreshPhotoThumb();
}
function refreshPhotoThumb() {
  const t = $('#photo-thumb'); if (!t) return;
  const cat = $('#f-cat2') ? $('#f-cat2').value : 'bolos';
  t.dataset.cat = cat;
  t.innerHTML = S.formPhoto ? `<img src="${esc(S.formPhoto)}" alt="Prévia da foto">` : art(cat);
}

async function saveForm(form) {
  const v = id => $(id, form).value.trim();
  const name = v('#f-name');
  const ings = v('#f-ing').split('\n').map(parseIngredient).filter(Boolean);
  const steps = v('#f-steps').split('\n').map(s => s.replace(/^\s*\d+\s*[.)\-–]\s*/, '').trim()).filter(Boolean);
  $('#err-name').textContent = name ? '' : 'Dê um nome para a receita.';
  $('#err-ing').textContent = ings.some(i => !i.heading) ? '' : 'Adicione pelo menos um ingrediente.';
  $('#err-steps').textContent = steps.length ? '' : 'Adicione pelo menos uma etapa.';
  if (!name) return $('#f-name').focus();
  if (!ings.some(i => !i.heading)) return $('#f-ing').focus();
  if (!steps.length) return $('#f-steps').focus();
  const old = form.dataset.id ? byId(form.dataset.id) : null;
  const rec = sanitizeRecipe({
    id: old ? old.id : uid(), name, category: v('#f-cat2'), description: v('#f-desc'),
    time: v('#f-time'), yield: { n: v('#f-yn'), label: v('#f-yl') || 'porções' }, difficulty: v('#f-diff2'),
    ingredients: ings, steps, tips: $('#f-tips', form).value.trim(),
    tags: v('#f-tags').split(',').map(t => t.trim()).filter(Boolean), photo: S.formPhoto,
    tone: old ? old.tone : undefined, featured: old ? old.featured : false,
    createdAt: old ? old.createdAt : Date.now(), updatedAt: Date.now(), source: old ? old.source : 'user'
  });
  try { await DB.put(rec); }
  catch { return toast('Não foi possível salvar. Talvez o espaço do aparelho esteja cheio.'); }
  const i = S.recipes.findIndex(x => x.id === rec.id);
  i >= 0 ? S.recipes[i] = rec : S.recipes.push(rec);
  S.scale.id = null;
  toast(old ? 'Receita atualizada' : 'Receita salva no seu caderno');
  location.hash = '#/receita/' + rec.id;
}

/* --- Minhas receitas --- */
function viewMine() {
  const list = S.recipes.filter(r => r.source === 'user').sort((a, b) => b.createdAt - a.createdAt);
  mount(`<h1 class="page-title">Minhas receitas</h1><p class="page-sub">As receitas que você criou, guardadas só neste aparelho.</p>
    <a class="btn primary" href="#/nova" style="margin-bottom:20px">${ic('plus')} Nova receita</a>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : emptyBox('Seu caderno está esperando', 'Cadastre aquela receita de família antes que o papel amarele.')}`);
}

/* --- Lista de compras --- */
function viewShop() {
  const pend = S.shop.filter(i => !i.done), done = S.shop.filter(i => i.done);
  const row = i => `<div class="shop-item ${i.done ? 'done' : ''}"><button class="check" data-action="shop-toggle" data-id="${i.id}" aria-label="${i.done ? 'Desmarcar' : 'Marcar como comprado'}: ${esc(i.text)}"><span>${ic('check')}</span></button><span class="t">${esc(i.text)}</span><button class="del" data-action="shop-del" data-id="${i.id}" aria-label="Excluir ${esc(i.text)}">${ic('x')}</button></div>`;
  mount(`<h1 class="page-title">Lista de compras</h1><p class="page-sub">${S.shop.length ? `${done.length} de ${S.shop.length} itens comprados` : 'Adicione ingredientes aqui ou direto de uma receita.'}</p>
    <form class="shop-add" id="shop-form"><input class="input" id="shop-input" placeholder="Ex.: 1 kg de farinha de trigo" aria-label="Novo item" maxlength="200" autocomplete="off"><button class="btn primary" type="submit" aria-label="Adicionar item">${ic('plus')}</button></form>
    ${S.shop.length ? `${pend.map(row).join('')}${done.length ? `<p class="sub-h">Comprados</p>${done.map(row).join('')}` : ''}
    <div class="btn-row" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:20px">
      <button class="btn ghost small" data-action="shop-copy">${ic('copy')} Copiar lista</button>
      ${done.length ? `<button class="btn ghost small" data-action="shop-clear-done">Remover comprados</button>` : ''}
      <button class="btn danger small" data-action="shop-clear-all">${ic('trash')} Limpar lista</button></div>`
      : emptyBox('Lista vazia', 'Na página de uma receita, toque em "Adicionar tudo à lista".')}`);
}

/* --- Conversor --- */
function viewConverter() {
  const opts = sel => Object.entries(CONV_UNITS).map(([k, u]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${u.l}</option>`).join('');
  mount(`<h1 class="page-title">Conversor de medidas</h1><p class="page-sub">Xícaras, colheres, ml e gramas sem fazer conta.</p>
    <section class="panel"><div class="conv">
      <div class="field"><label for="c-v">Quantidade</label><input class="input" id="c-v" type="text" inputmode="decimal" value="1"></div>
      <div class="two"><div class="field"><label for="c-from">De</label><select class="select" id="c-from">${opts('xic')}</select></div>
      <div class="field"><label for="c-to">Para</label><select class="select" id="c-to">${opts('ml')}</select></div></div>
      <div class="field"><label for="c-ing">Ingrediente (para converter entre volume e peso)</label><select class="select" id="c-ing"><option value="">Nenhum</option>${DENSITY.map(d => `<option value="${d[1]}">${d[0]}</option>`).join('')}</select></div>
      <div class="result" id="c-res" aria-live="polite"></div></div></section>
    <section class="panel"><h2>Medidas de bolso</h2><table class="table"><tbody>
      <tr><td>1 xícara</td><td>240 ml</td></tr><tr><td>½ xícara</td><td>120 ml</td></tr><tr><td>¼ de xícara</td><td>60 ml</td></tr>
      <tr><td>1 colher de sopa</td><td>15 ml</td></tr><tr><td>1 colher de chá</td><td>5 ml</td></tr><tr><td>1 colher de sopa</td><td>3 colheres de chá</td></tr>
      <tr><td>1 litro</td><td>1.000 ml</td></tr><tr><td>1 quilo</td><td>1.000 g</td></tr></tbody></table>
      <p class="hint" style="margin-top:10px;color:var(--muted);font-size:.86rem">Pesos por xícara são aproximados e podem variar conforme a marca e o jeito de encher a medida.</p></section>`);
  updateConv();
}
function updateConv() {
  const v = parseFloat(($('#c-v').value || '').replace(',', '.'));
  const from = $('#c-from').value, to = $('#c-to').value, dens = parseFloat($('#c-ing').value) || 0;
  const out = $('#c-res');
  if (!isFinite(v) || v < 0) { out.innerHTML = 'Digite uma quantidade'; return; }
  const res = convert(v, from, to, dens);
  if (res == null) { out.innerHTML = 'Escolha um ingrediente<small>Para trocar volume por peso, precisamos saber o que está sendo medido.</small>'; return; }
  const txt = (to === 'xic' || to === 'csopa' || to === 'cchá') ? fmtFrac(res) : fmtMetric(res);
  const lab = UNIT_LABEL[to][res > 1.0001 ? 1 : 0];
  out.innerHTML = `${txt} ${lab}<small>${esc(String(v).replace('.', ','))} ${esc(UNIT_LABEL[from][v > 1.0001 ? 1 : 0])}${dens ? ' (valor aproximado)' : ''}</small>`;
}

/* --- Perfil --- */
function viewProfile() {
  const mine = S.recipes.filter(r => r.source === 'user').length;
  const link = (href, icon, t, sub, act) => `<${href ? 'a href="' + href + '"' : 'button data-action="' + act + '"'}><span class="dot">${ic(icon)}</span><span class="grow">${t}<small>${sub}</small></span></${href ? 'a' : 'button'}>`;
  mount(`<h1 class="page-title sr-only">Perfil</h1>
    <div class="profile-card"><div class="avatar art" data-cat="cupcakes">${art('cupcakes')}</div><div><h2>Meu caderno</h2><p>Receitas feitas para adoçar seus momentos.</p></div></div>
    <div class="stats"><div class="stat"><b>${S.recipes.length}</b><span>receitas</span></div><div class="stat"><b>${S.fav.size}</b><span>favoritas</span></div><div class="stat"><b>${mine}</b><span>criadas por você</span></div></div>
    <div class="privacy">${ic('lock')}<span>Tudo fica só neste aparelho. O app não usa servidores, contas, rastreamento nem notificações, e funciona sem internet.</span></div>
    <div class="list-links">
      ${link('#/minhas', 'book', 'Minhas receitas', 'As receitas que você criou')}
      ${link('#/compras', 'cart', 'Lista de compras', S.shop.filter(i => !i.done).length + ' itens para comprar')}
      ${link('#/conversor', 'scale', 'Conversor de medidas', 'Xícaras, colheres, ml e gramas')}
    </div>
    <div class="section-title" style="margin-top:6px"><h2>Aparência</h2></div>
    <div class="seg" role="group" aria-label="Tema">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button data-action="set-theme" data-v="${k}" aria-pressed="${S.settings.theme === k}">${l}</button>`).join('')}</div>
    <div class="section-title"><h2>Backup</h2></div>
    <div class="list-links">
      ${link('', 'download', 'Exportar backup', 'Salva receitas, favoritos, lista e tema em um arquivo', 'export')}
      ${link('', 'upload', 'Importar backup', 'Restaura de um arquivo .json', 'import-click')}
      ${link('', 'refresh', 'Restaurar receitas originais', 'Traz de volta as receitas que vieram com o app', 'restore-seeds')}
      <button class="danger" data-action="wipe"><span class="dot">${ic('trash')}</span><span class="grow">Apagar todos os dados<small>Remove tudo deste aparelho</small></span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`);
}

/* ---------- 9. Ações, eventos e roteador ---------- */
function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = dark ? '#2b1c20' : '#f6c9d4';
  renderTopbar();
}

function renderNav() {
  const items = [['home', '#/', 'Início'], ['grid', '#/categorias', 'Categorias'], ['search', '#/buscar', 'Buscar'], ['heart', '#/favoritos', 'Favoritos'], ['user', '#/perfil', 'Perfil']];
  $('#nav').innerHTML = `<a class="nav-brand" href="#/">Bolos d' Maitê</a>
    ${items.map(([i, h, l]) => `<a class="nav-link" href="${h}" data-nav="${h.replace('#/', '')}">${ic(i)}<span>${l}</span></a>`).join('')}
    <p class="nav-extra">Seu caderno</p>
    <a class="nav-link nav-extra" href="#/nova" data-nav="nova">${ic('plus')}<span>Nova receita</span></a>
    <a class="nav-link nav-extra" href="#/minhas" data-nav="minhas">${ic('book')}<span>Minhas receitas</span></a>
    <a class="nav-link nav-extra" href="#/compras" data-nav="compras">${ic('cart')}<span>Lista de compras</span></a>
    <a class="nav-link nav-extra" href="#/conversor" data-nav="conversor">${ic('scale')}<span>Conversor</span></a>
    <p class="nav-foot">Tudo salvo só neste aparelho.</p>`;
}
function renderTopbar() {
  const pending = S.shop.filter(i => !i.done).length;
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#topbar').innerHTML = `<a class="brand-mini" href="#/">${'Bolos d\' Maitê'}</a>
    <div class="actions"><a class="icon-btn" href="#/compras" aria-label="Lista de compras${pending ? ', ' + pending + ' itens' : ''}">${ic('cart')}${pending ? `<span class="badge">${pending}</span>` : ''}</a>
    <button class="icon-btn" data-action="theme-toggle" aria-label="${dark ? 'Ativar modo claro' : 'Ativar modo escuro'}">${ic(dark ? 'sun' : 'moon')}</button></div>`;
}
function setNavActive(key) {
  $$('#nav a.nav-link').forEach(a => {
    const on = a.dataset.nav === key;
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

const NAVMAP = { '': '', categorias: 'categorias', buscar: 'buscar', favoritos: 'favoritos', perfil: 'perfil', minhas: 'minhas', compras: 'compras', conversor: 'conversor', nova: 'nova' };
const TITLES = { '': 'Início', categorias: 'Categorias', buscar: 'Buscar', favoritos: 'Favoritos', perfil: 'Perfil', minhas: 'Minhas receitas', compras: 'Lista de compras', conversor: 'Conversor', nova: 'Nova receita', editar: 'Editar receita' };

function route(keepScroll) {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean);
  const head = parts[0] || '', arg = parts[1];
  const params = new URLSearchParams(qs || '');
  const y = window.scrollY;
  S.view = head;
  document.body.dataset.view = head;
  switch (head) {
    case '': viewHome(); break;
    case 'categorias': viewCategories(); break;
    case 'buscar': viewSearch(params); break;
    case 'favoritos': viewFavorites(); break;
    case 'perfil': viewProfile(); break;
    case 'receita': viewRecipe(decodeURIComponent(arg || '')); break;
    case 'nova': viewForm(null); break;
    case 'editar': viewForm(decodeURIComponent(arg || '')); break;
    case 'minhas': viewMine(); break;
    case 'compras': viewShop(); break;
    case 'conversor': viewConverter(); break;
    default: mount(emptyBox('Página não encontrada', 'Vamos voltar para a cozinha?', '<a class="btn primary" href="#/">Ir para o início</a>'));
  }
  const navKey = head === 'receita' || head === 'editar' ? 'none' : (NAVMAP[head] ?? '');
  setNavActive(navKey === 'minhas' || navKey === 'compras' || navKey === 'conversor' || navKey === 'nova' ? navKey : navKey);
  // no celular, rotas secundárias iluminam "Perfil"
  if (['minhas', 'compras', 'conversor'].includes(head) && window.innerWidth < 900) setNavActive('perfil');
  document.title = (head === 'receita' && byId(decodeURIComponent(arg || '')) ? byId(decodeURIComponent(arg)).name : TITLES[head] || 'Bolos d\' Maitê') + " — Bolos d' Maitê";
  if (keepScroll === true) window.scrollTo(0, y); else { window.scrollTo(0, 0); if (!S.focusSearch) app().focus({ preventScroll: true }); }
}

function recipeShareText(r) {
  const f = S.scale.id === r.id ? S.scale.n / r.yield.n : 1, n = S.scale.id === r.id ? S.scale.n : r.yield.n, sys = S.scale.id === r.id ? S.scale.system : 'orig';
  const lines = r.ingredients.map(i => i.heading ? `\n${i.heading}:` : `• ${ingText(i, f, sys)}`);
  return { head: `${r.name}\nRende ${yieldText(n, r.yield.label)} · ${fmtTime(r.time)} · ${r.difficulty}`, ing: lines.join('\n'), steps: r.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), tips: r.tips };
}

function setFav(id) {
  S.fav.has(id) ? S.fav.delete(id) : S.fav.add(id);
  saveFav();
  const on = S.fav.has(id);
  $$(`[data-action="fav"][data-id="${CSS.escape(id)}"]`).forEach(b => {
    b.setAttribute('aria-pressed', on);
    const l = $('.lbl', b);
    if (l) l.textContent = on ? 'Favoritada' : 'Favoritar'; else b.setAttribute('aria-label', on ? 'Remover dos favoritos' : 'Favoritar');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  });
  toast(on ? 'Adicionada aos favoritos' : 'Removida dos favoritos');
  if (S.view === 'favoritos') setTimeout(() => route(true), 280);
}

function addToShop(texts) {
  let added = 0;
  texts.forEach(t => {
    t = t.trim(); if (!t) return;
    if (S.shop.some(i => !i.done && norm(i.text) === norm(t))) return;
    S.shop.push({ id: uid(), text: t, done: false }); added++;
  });
  saveShop(); renderTopbar();
  return added;
}

const ACTIONS = {
  back(el, e) { if (history.length > 1) { e.preventDefault(); history.back(); } },
  fav(el) { setFav(el.dataset.id); },
  'theme-toggle'() {
    S.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    saveSettings(); applyTheme(); if (S.view === 'perfil') route(true);
  },
  'set-theme'(el) { S.settings.theme = el.dataset.v; saveSettings(); applyTheme(); route(true); },
  'toggle-fav-filter'(el) { S.filters.favOnly = !S.filters.favOnly; el.setAttribute('aria-pressed', S.filters.favOnly); renderResults(); },

  'scale-inc'() { S.scale.n = Math.min(999, S.scale.n + 1); updateScaleUI(); },
  'scale-dec'() { S.scale.n = Math.max(1, S.scale.n - 1); updateScaleUI(); },
  'scale-set'(el) { S.scale.n = +el.dataset.n; updateScaleUI(); },
  system(el) { S.scale.system = el.dataset.v; updateScaleUI(); },
  'ing-toggle'(el) { const i = +el.dataset.i; S.scale.got.has(i) ? S.scale.got.delete(i) : S.scale.got.add(i); el.classList.toggle('got'); },
  'step-toggle'(el) { const i = +el.dataset.i; S.scale.done.has(i) ? S.scale.done.delete(i) : S.scale.done.add(i); el.classList.toggle('done'); },

  'shop-add-one'(el, e) {
    e.stopPropagation();
    const r = byId(S.scale.id), ing = r.ingredients[+el.dataset.i];
    const added = addToShop([ingText(ing, S.scale.n / r.yield.n, S.scale.system)]);
    toast(added ? 'Adicionado à lista de compras' : 'Já está na sua lista');
  },
  'shop-add-all'() {
    const r = byId(S.scale.id), f = S.scale.n / r.yield.n;
    const added = addToShop(r.ingredients.filter(i => !i.heading).map(i => ingText(i, f, S.scale.system)));
    toast(added ? `${added} ${added === 1 ? 'item adicionado' : 'itens adicionados'} à lista` : 'Tudo isso já está na sua lista');
  },
  async 'copy-ing'() {
    const r = byId(S.scale.id), t = recipeShareText(r);
    toast(await copyText(`${t.head}\n\nIngredientes:\n${t.ing}`) ? 'Ingredientes copiados' : 'Não foi possível copiar');
  },
  async share() {
    const r = byId(S.scale.id), t = recipeShareText(r);
    const text = `${t.head}\n\nIngredientes:\n${t.ing}\n\nModo de preparo:\n${t.steps}${t.tips ? '\n\nDicas:\n' + t.tips : ''}\n\nReceita do app Bolos d' Maitê`;
    if (navigator.share) { try { await navigator.share({ title: r.name, text }); } catch { /* cancelado */ } return; }
    toast(await copyText(text) ? 'Receita copiada: cole onde quiser compartilhar' : 'Não foi possível compartilhar');
  },
  print() { window.print(); },
  async delete() {
    const r = byId(S.scale.id);
    if (!await confirmBox('Excluir receita?', `"${r.name}" será removida deste aparelho. Isso não pode ser desfeito.`, 'Excluir', true)) return;
    await DB.remove(r.id);
    S.recipes = S.recipes.filter(x => x.id !== r.id); S.fav.delete(r.id); saveFav(); S.scale.id = null;
    toast('Receita excluída'); location.hash = '#/';
  },
  'photo-remove'() { S.formPhoto = null; refreshPhotoThumb(); },

  'shop-toggle'(el) { const i = S.shop.find(x => x.id === el.dataset.id); if (i) i.done = !i.done; saveShop(); renderTopbar(); route(true); },
  'shop-del'(el) { S.shop = S.shop.filter(x => x.id !== el.dataset.id); saveShop(); renderTopbar(); route(true); },
  'shop-clear-done'() { S.shop = S.shop.filter(i => !i.done); saveShop(); renderTopbar(); route(true); },
  async 'shop-clear-all'() {
    if (!await confirmBox('Limpar a lista?', 'Todos os itens serão removidos.', 'Limpar tudo', true)) return;
    S.shop = []; saveShop(); renderTopbar(); route(true);
  },
  async 'shop-copy'() { toast(await copyText(S.shop.filter(i => !i.done).map(i => '• ' + i.text).join('\n')) ? 'Lista copiada' : 'Não foi possível copiar'); },

  export() {
    const data = { app: 'bolos-d-maite', version: 1, exportedAt: new Date().toISOString(), recipes: S.recipes, favorites: [...S.fav], shopping: S.shop, settings: S.settings };
    downloadFile(`bolos-d-maite-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
    toast('Backup salvo no seu aparelho');
  },
  'import-click'() { $('#import-file').click(); },
  async 'restore-seeds'() {
    if (!await confirmBox('Restaurar receitas originais?', 'As receitas que vieram com o app voltam ao estado original. Suas receitas não são alteradas.', 'Restaurar')) return;
    const list = SEED.map(seedToRecipe);
    await DB.bulkPut(list);
    list.forEach(r => { const i = S.recipes.findIndex(x => x.id === r.id); i >= 0 ? S.recipes[i] = r : S.recipes.push(r); });
    LS.set('bdm_seeded', 1); toast('Receitas originais restauradas'); route(true);
  },
  async wipe() {
    if (!await confirmBox('Apagar todos os dados?', 'Receitas, favoritos, lista de compras e configurações serão removidos deste aparelho. Considere exportar um backup antes.', 'Apagar tudo', true)) return;
    await DB.clear();
    S.recipes = []; S.fav = new Set(); S.shop = []; S.settings = { theme: 'auto' }; S.scale.id = null;
    saveFav(); saveShop(); saveSettings(); LS.set('bdm_seeded', 1);
    applyTheme(); toast('Dados apagados'); route();
  }
};

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('Esse arquivo não é um backup válido.'); }
  if (!data || data.app !== 'bolos-d-maite' || !Array.isArray(data.recipes)) return toast('Esse arquivo não é um backup do Bolos d\' Maitê.');
  const recipes = data.recipes.map(sanitizeRecipe).filter(Boolean);
  const mode = await modal({
    title: 'Importar backup', message: `Encontramos ${recipes.length} ${recipes.length === 1 ? 'receita' : 'receitas'} neste arquivo. Como deseja importar?`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Mesclar com o que já tenho', value: 'merge', kind: 'primary' }, { label: 'Substituir tudo', value: 'replace', kind: 'danger' }]
  });
  if (!mode) return;
  const favs = (Array.isArray(data.favorites) ? data.favorites : []).map(String);
  const shop = (Array.isArray(data.shopping) ? data.shopping : []).filter(i => i && i.text).map(i => ({ id: uid(), text: String(i.text).slice(0, 200), done: !!i.done }));
  if (mode === 'replace') {
    await DB.clear(); await DB.bulkPut(recipes);
    S.recipes = recipes; S.fav = new Set(favs); S.shop = shop;
    if (data.settings && ['auto', 'light', 'dark'].includes(data.settings.theme)) S.settings.theme = data.settings.theme;
  } else {
    await DB.bulkPut(recipes);
    recipes.forEach(r => { const i = S.recipes.findIndex(x => x.id === r.id); i >= 0 ? S.recipes[i] = r : S.recipes.push(r); });
    favs.forEach(f => S.fav.add(f));
    shop.forEach(i => { if (!S.shop.some(x => norm(x.text) === norm(i.text))) S.shop.push(i); });
  }
  saveFav(); saveShop(); saveSettings(); LS.set('bdm_seeded', 1);
  applyTheme(); renderTopbar(); toast('Backup importado com sucesso'); route();
}

/* Eventos delegados */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el, e);
});
document.addEventListener('focusin', e => {
  if (e.target.id === 'home-search') { S.focusSearch = true; S.filters = { q: '', cat: '', time: '', diff: '', favOnly: false }; location.hash = '#/buscar'; }
});
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'q') { S.filters.q = e.target.value; renderResults(); }
  else if (id === 'scale-n') { const n = Math.round(+e.target.value); if (n >= 1 && n <= 999) { S.scale.n = n; const r = byId(S.scale.id); $('#ing-list').innerHTML = ingListHTML(r, n / r.yield.n, S.scale.system); $('#fact-yield span').textContent = yieldText(n, r.yield.label); $('#scale-chips').innerHTML = scaleChips(r); } }
  else if (id === 'c-v') updateConv();
});
document.addEventListener('change', async e => {
  const id = e.target.id;
  if (id === 'f-cat') { S.filters.cat = e.target.value; renderResults(); }
  else if (id === 'f-time') { S.filters.time = e.target.value; renderResults(); }
  else if (id === 'f-diff') { S.filters.diff = e.target.value; renderResults(); }
  else if (id === 'c-from' || id === 'c-to' || id === 'c-ing') updateConv();
  else if (id === 'f-cat2') refreshPhotoThumb();
  else if (id === 'scale-n') updateScaleUI();
  else if (id === 'photo-file' && e.target.files[0]) {
    try { S.formPhoto = await fileToDataURL(e.target.files[0]); refreshPhotoThumb(); }
    catch { toast('Não foi possível ler essa imagem.'); }
  } else if (id === 'import-file' && e.target.files[0]) {
    const f = e.target.files[0]; e.target.value = ''; importBackup(f);
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'recipe-form') saveForm(e.target);
  if (e.target.id === 'shop-form') {
    const inp = $('#shop-input'), added = addToShop([inp.value]);
    if (!inp.value.trim()) return;
    if (!added) toast('Esse item já está na lista');
    route(true); $('#shop-input').focus();
  }
});
window.addEventListener('hashchange', () => route());
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (S.settings.theme === 'auto') applyTheme(); });

/* ---------- 10. Inicialização ---------- */
async function boot() {
  applyTheme();
  renderNav();
  await DB.open();
  try { S.recipes = (await DB.getAll()).map(sanitizeRecipe).filter(Boolean); } catch { S.recipes = []; }
  if (!LS.get('bdm_seeded', false)) {
    const list = SEED.map(seedToRecipe);
    try { await DB.bulkPut(list); } catch { /* segue só em memória */ }
    S.recipes = S.recipes.concat(list.filter(r => !S.recipes.some(x => x.id === r.id)));
    LS.set('bdm_seeded', 1);
  }
  route();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('service-worker.js').catch(() => { /* offline-first: sem problema */ });
  }
}
boot();
})();
