import assert from 'node:assert/strict';
import {parseThemeCss, sanitizeTheme, normalizeColor} from '../assets/appearance.js';

const light = '--bg:#f4f5f9;--surface:#fff;--text:#20213a;--primary:#4941ce;--primary-contrast:#fff;';
const dark = '--bg:#141422;--surface:#202033;--text:#f1f0fb;--primary:#b6adff;--primary-contrast:#211850;';
const exported = `@import url("https://fonts.googleapis.com/css2?family=Inter");
/* ThemeBuilder export: Skog */
:root {${light}--radius-md:12px;--font-body:"Inter", sans-serif;}
[data-theme="dark"] {${dark}--radius-md:12px;--font-body:"Inter", sans-serif;}
[data-theme="light"] {${light}}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${dark}} }
body { background:url(https://example.com/tracker);position:fixed; }
.theme-button { --primary:#000; }`;

const theme = parseThemeCss(exported);
assert.equal(theme.name,'Skog');
assert.equal(theme.light.bg,'#f4f5f9');
assert.equal(theme.dark.bg,'#141422');
assert.equal(theme.light.surface,'#ffffff');
assert.equal(theme.light['radius-md'],'12px');
assert.equal(theme.light['font-body'],'"Inter", sans-serif');
assert.equal(theme.light.primary,'#4941ce');
assert.ok(!JSON.stringify(theme).includes('url('));
assert.deepEqual(sanitizeTheme(theme),theme);
assert.throws(() => parseThemeCss(`:root {${light}}`),/mörk variant/);
assert.throws(() => parseThemeCss(`:root {--bg:#fff;}[data-theme="dark"]{${dark}}`),/nödvändiga färger/);
assert.throws(() => parseThemeCss(exported.replace('--primary:#4941ce','--primary:url(https://example.com/evil)')),/kunde inte läsas/);
assert.throws(() => parseThemeCss(exported.replace('12px','99px')),/kunde inte läsas/);
assert.throws(() => parseThemeCss(exported.replace('"Inter", sans-serif','var(--untrusted)')),/kunde inte läsas/);
assert.throws(() => parseThemeCss('å'.repeat(32769)),/64 kB/);
assert.equal(normalizeColor('#AbC'),'#aabbcc');
assert.equal(normalizeColor('url(https://example.com)'),null);
assert.equal(normalizeColor('var(--bg)'),null);
assert.equal(normalizeColor('#fff; color:red'),null);
const extra = structuredClone(theme);
extra.light['unknown-token'] = 'url(https://example.com)';
assert.ok(!Object.hasOwn(sanitizeTheme(extra).light,'unknown-token'));
console.log('PASS: ThemeBuilder variants, CSS isolation, import allowlist, bounded payload, unsafe values, theme sanitization.');
