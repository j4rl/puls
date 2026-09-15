// ThemeBuilder exports values, not a remote theme catalogue. Never execute imported CSS.
const COLOR_TOKENS = ['bg','surface','surface-muted','text','muted','border','primary','primary-hover','primary-contrast','accent','accent-contrast','secondary','tertiary','success','warning','danger'];
const RADIUS_TOKENS = ['radius-sm','radius-md','radius-lg'];
const FONT_TOKENS = ['font-body','font-heading'];
const TOKENS = [...COLOR_TOKENS, ...RADIUS_TOKENS, ...FONT_TOKENS];
const REQUIRED = ['bg','surface','text','primary','primary-contrast'];
const MAX_CSS_BYTES = 65536;
let colorContext;

export function normalizeColor(value) {
 value = value.trim().toLowerCase();
 if (/^#[0-9a-f]{6}$/.test(value)) return value;
 if (/^#[0-9a-f]{3}$/.test(value)) return '#' + [...value.slice(1)].map(c => c + c).join('');
 // A finite grammar rejects references, custom properties and resource requests.
 if (!/^(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([\d\s.,%+\-/a-z]+\)$/.test(value) || /(?:url|var|calc|expression)/.test(value)) return null;
 if (typeof document === 'undefined' || !globalThis.CSS?.supports('color', value)) return null;
 colorContext ??= document.createElement('canvas').getContext('2d', {willReadFrequently:true});
 if (!colorContext) return null;
 colorContext.clearRect(0, 0, 1, 1);
 colorContext.fillStyle = value;
 colorContext.fillRect(0, 0, 1, 1);
 const pixel = colorContext.getImageData(0, 0, 1, 1).data;
 if (pixel[3] !== 255) return null;
 return '#' + [...pixel.slice(0, 3)].map(n => n.toString(16).padStart(2, '0')).join('');
}

function cleanToken(key, value, color = normalizeColor) {
 if (typeof value !== 'string' || value.length > 200) return null;
 value = value.trim();
 if (COLOR_TOKENS.includes(key)) return color(value);
 if (RADIUS_TOKENS.includes(key)) return /^\d{1,2}(?:\.\d{1,2})?px$/.test(value) && parseFloat(value) <= 64 ? value : null;
 if (FONT_TOKENS.includes(key)) return /^[a-zA-Z0-9\s,'"-]+$/.test(value) && !/[\r\n\t]/.test(value) ? value : null;
 return null;
}

export function sanitizeTheme(theme) {
 if (!theme || typeof theme !== 'object' || typeof theme.name !== 'string') throw Error('Temat har ett ogiltigt format.');
 const result = {name:theme.name.trim().slice(0, 80),light:{},dark:{}};
 if (!result.name) result.name = 'Mitt tema';
 for (const mode of ['light','dark']) {
  if (!theme[mode] || typeof theme[mode] !== 'object') throw Error('Temat behöver både en ljus och en mörk variant.');
  for (const key of TOKENS) {
   if (!Object.hasOwn(theme[mode], key)) continue;
   const value = cleanToken(key, theme[mode][key]);
   if (value === null) throw Error(`Temat innehåller ett ogiltigt värde för ${key}.`);
   result[mode][key] = value;
  }
  if (REQUIRED.some(key => !result[mode][key])) throw Error('Temat saknar nödvändiga färger. Exportera det igen från ThemeBuilder.');
 }
 return result;
}

export function parseThemeCss(css, name = 'Mitt tema') {
 if (typeof css !== 'string' || new TextEncoder().encode(css).length > MAX_CSS_BYTES) throw Error('CSS-filen får vara högst 64 kB.');
 const exportedName = css.match(/ThemeBuilder export:\s*([^\r\n*]+)/i)?.[1]?.trim();
 const blocks = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import\s+[^;]*;/gi, '').matchAll(/([^{}]+)\{([^{}]*)\}/g);
 const result = {name:exportedName || name,light:{},dark:{}};
 let hasDark = false;
 for (const [,selectorText,body] of blocks) {
  const selector = selectorText.trim();
  const mode = selector === ':root' || /^(?:html|body)?\[data-theme=["']light["']\]$/.test(selector) ? 'light' : /^(?:html|body)?\[data-theme=["']dark["']\]$/.test(selector) ? 'dark' : null;
  if (!mode) continue;
  if (mode === 'dark') hasDark = true;
  for (const [,key,raw] of body.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;{}]+);/g)) {
   if (!TOKENS.includes(key)) continue;
   const value = cleanToken(key, raw);
   if (value === null) throw Error(`Färgen eller värdet ${key} kunde inte läsas. Exportera med färgformatet hex i ThemeBuilder.`);
   result[mode][key] = value;
  }
 }
 if (!hasDark) throw Error('Ingen mörk variant hittades. Använd en CSS-export från theme.j4rl.se.');
 return sanitizeTheme(result);
}

function initialMode() {
 let mode;
 try { mode = localStorage.getItem('ld-theme'); } catch {}
 return ['system','light','dark'].includes(mode) ? mode : 'system';
}

function startLightDark() {
 const toggle = document.querySelector('#theme-mode');
 const fallback = document.querySelector('#theme-fallback');
 const select = document.querySelector('#theme-mode-fallback');
 if (!toggle || !select) return;
 const media = window.matchMedia('(prefers-color-scheme: dark)');
 let mode = initialMode();
 const apply = () => {
  if (customElements.get('ld-theme-toggle')) return;
  document.body.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
  select.value = mode;
 };
 apply();
 select.addEventListener('change', () => {
  mode = select.value;
  try { localStorage.setItem('ld-theme', mode); } catch {}
  apply();
 });
 media.addEventListener('change', apply);
 window.addEventListener('storage', event => {
  if (event.key !== 'ld-theme' && event.key !== null) return;
  mode = initialMode();
  if (typeof toggle.setMode === 'function') toggle.setMode(mode);
  else apply();
 });
 const activate = () => {
  toggle.hidden = false;
  fallback.hidden = true;
  const labels = {system:'Följ systemet',light:'Ljust utseende',dark:'Mörkt utseende'};
  toggle.shadowRoot?.querySelector('[role="group"]')?.setAttribute('aria-label', 'Ljust eller mörkt utseende');
  toggle.shadowRoot?.querySelectorAll('button[data-mode]').forEach(button => {
   button.title = labels[button.dataset.mode];
   button.setAttribute('aria-label', labels[button.dataset.mode]);
  });
 };
 customElements.whenDefined('ld-theme-toggle').then(activate);
 // The local selector stays fully usable while the CDN loads or is unavailable.
 const script = document.createElement('script');
 script.src = 'https://ld.j4rl.se/ld-theme-toggle.js';
 script.async = true;
 document.head.append(script);
}

function applyTheme(theme) {
 const body = document.body;
 const mode = body.dataset.theme === 'dark' ? 'dark' : 'light';
 for (const token of TOKENS) body.style.removeProperty('--' + token);
 for (const token of ['stage-background','stage-foreground','stage-muted','chart-1','chart-2','chart-3','chart-4','chart-5','chart-6']) body.style.removeProperty('--' + token);
 if (theme) {
  for (const [key,value] of Object.entries(theme[mode])) body.style.setProperty('--' + key, value);
  const dark = theme.dark;
  body.style.setProperty('--stage-background', dark.surface);
  body.style.setProperty('--stage-foreground', dark.text);
  body.style.setProperty('--stage-muted', dark.muted || dark.text);
  [dark.primary,dark.accent,dark.secondary,dark.tertiary,dark.success,dark.warning].forEach((color,index) => {
   if (color) body.style.setProperty('--chart-' + (index + 1), color);
  });
 }
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(body).getPropertyValue('--primary').trim());
}

function loadThemeFonts(theme) {
 document.querySelector('#theme-fonts')?.remove();
 if (!theme) return;
 const families = [...new Set(FONT_TOKENS.map(key => theme.light[key]?.split(',')[0].replace(/["']/g, '').trim()).filter(Boolean))];
 const generic = ['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-serif','ui-sans-serif','ui-monospace','Arial','Helvetica','Georgia','Verdana','Tahoma','Times New Roman','Courier New'];
 const query = new URLSearchParams();
 families.filter(family => !generic.includes(family)).forEach(family => query.append('family', family + ':wght@400;500;600;700'));
 if (!query.has('family')) return;
 query.set('display','swap');
 const link = document.createElement('link');
 link.id = 'theme-fonts';
 link.rel = 'stylesheet';
 link.href = 'https://fonts.googleapis.com/css2?' + query;
 document.head.append(link);
}

export function initAppearance({user = null, api}) {
 const button = document.querySelector('#theme-settings');
 let currentUser = null, currentTheme = null, busy = false;
 const dialog = document.createElement('dialog');
 dialog.className = 'appearance-dialog';
 dialog.setAttribute('aria-labelledby','appearance-title');
 dialog.innerHTML = `<div class="dialog-heading"><h2 id="appearance-title">Mitt tema</h2><button class="btn" type="button" data-close aria-label="Stäng temainställningar">Stäng</button></div><p class="muted">Ditt tema sparas på kontot och följer med när du loggar in på en annan enhet.</p><p class="theme-current" id="theme-current"></p><ol class="theme-steps"><li><a class="textbutton" href="https://theme.j4rl.se/" target="_blank" rel="noopener">Skapa ditt tema i ThemeBuilder ↗</a></li><li>Kopiera eller ladda ned den exporterade CSS-koden.</li><li>Importera den här. Både ljust och mörkt utseende följer med.</li></ol><form id="theme-import-form"><label class="field"><span>Välj exporterad CSS-fil</span><input type="file" name="file" accept=".css,text/css" id="theme-file"></label><label class="field"><span>Eller klistra in CSS-koden</span><textarea id="theme-css" name="css" rows="5" maxlength="65536" spellcheck="false" placeholder=":root { … }"></textarea></label><label class="field"><span>Temats namn</span><input id="theme-name" name="name" maxlength="80" placeholder="Mitt tema"></label><div id="theme-feedback" role="status" aria-live="polite"></div><div class="dialog-actions"><button class="btn primary" id="save-theme" type="submit">Spara och använd</button><button class="btn" id="reset-theme" type="button">Återställ Puls-temat</button></div></form>`;
 document.body.append(dialog);
 const form = dialog.querySelector('form');
 const feedback = dialog.querySelector('#theme-feedback');
 const status = (message, failed = false) => {
  feedback.textContent = message;
  feedback.className = failed ? 'error' : 'theme-feedback';
 };
 function setUser(next) {
  currentUser = next;
  currentTheme = null;
  if (next?.theme) {
   try { currentTheme = sanitizeTheme(next.theme); } catch { /* Invalid old preferences fall back to Puls. */ }
  }
  button.hidden = !next;
  if (!next) dialog.close();
  applyTheme(currentTheme);
  loadThemeFonts(currentTheme);
  dialog.querySelector('#theme-current').textContent = 'Aktivt tema: ' + (currentTheme?.name || 'Puls');
  dialog.querySelector('#reset-theme').disabled = !currentTheme;
 }
 button.addEventListener('click', () => {
  status('');
  form.reset();
  dialog.showModal();
 });
 dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
 const fileInput = dialog.querySelector('#theme-file');
 fileInput.addEventListener('change', async () => {
  status('');
  const file = fileInput.files[0];
  if (!file) return;
  try {
   if (file.size > MAX_CSS_BYTES) throw Error('CSS-filen får vara högst 64 kB.');
   dialog.querySelector('#theme-css').value = await file.text();
   dialog.querySelector('#theme-name').value = file.name.replace(/\.css$/i, '').slice(0, 80);
  } catch (err) {
   fileInput.value = '';
   dialog.querySelector('#theme-css').value = '';
   status(err.message, true);
  }
 });
 async function save(theme) {
  if (!currentUser || busy) return;
  busy = true;
  status('Sparar temat…');
  const fields = [...form.querySelectorAll('button,input,textarea')];
  fields.forEach(field => field.disabled = true);
  try {
   const response = await api('preferences', {data:{theme}});
   setUser(response.user || {...currentUser,theme});
   status(theme ? 'Temat är sparat och används nu.' : 'Puls-temat används nu.');
  } catch (err) { status(err.message, true); }
  finally {
   busy = false;
   fields.forEach(field => field.disabled = false);
   dialog.querySelector('#reset-theme').disabled = !currentTheme;
  }
 }
 form.addEventListener('submit', event => {
  event.preventDefault();
  try {
   const css = dialog.querySelector('#theme-css').value;
   if (!css.trim()) throw Error('Välj en CSS-fil eller klistra in din export först.');
   const theme = parseThemeCss(css);
   const name = dialog.querySelector('#theme-name').value.trim();
   if (name) theme.name = name;
   save(theme);
  } catch (err) { status(err.message, true); }
 });
 dialog.querySelector('#reset-theme').addEventListener('click', () => save(null));
 new MutationObserver(() => applyTheme(currentTheme)).observe(document.body, {attributes:true,attributeFilter:['data-theme']});
 setUser(user);
 return {setUser};
}

if (typeof document !== 'undefined') startLightDark();
