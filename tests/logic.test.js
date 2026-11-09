/* Node tests for renderer/core.js - run: npm test */
const assert = require('assert');
const Core = require('../renderer/core.js');

let passed = 0;
const pending = [];
function ok(name, fn) {
  const r = fn();
  if (r && typeof r.then === 'function') pending.push(r.then(() => { passed++; console.log('  ✓', name); }));
  else { passed++; console.log('  ✓', name); }
}

console.log('YTV2 core tests');

ok('v2 CSV roundtrip keeps commas, quotes and multiple links/tags', () => {
  const entries = [Core.normalizeEntry({
    name: '夜風, るる "test"',
    favorite: true,
    tags: ['ゲーム,実況', 'ホラー'],
    notes: 'メモ1行目\nメモ2行目',
    links: [
      { label: 'YouTube', url: 'https://youtube.com/@example' },
      { label: 'Twitch', url: 'https://twitch.tv/example' },
    ],
  })];
  const back = Core.entriesFromCSV(Core.entriesToCSV(entries));
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].name, entries[0].name);
  assert.deepStrictEqual(back[0].tags, entries[0].tags);
  assert.strictEqual(back[0].favorite, true);
  assert.strictEqual(back[0].notes, entries[0].notes);
  assert.deepStrictEqual(back[0].links, entries[0].links);
});

ok('v1 CSV (quoted, tags comma-joined in one cell) converts', () => {
  const v1 = 'name,youtube,x,tags,favorite\r\n"太郎","https://youtu.be/a","https://x.com/a","ゲーム,実況","true"\r\n';
  const out = Core.entriesFromCSV(v1);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].links.length, 2);
  assert.strictEqual(out[0].links[0].label, 'YouTube');
  assert.deepStrictEqual(out[0].tags, ['ゲーム', '実況']);
});

ok('v1 userData object converts to v2 entries', () => {
  const out = Core.fromV1Object({ '花子': { youtube: 'https://youtu.be/b', x: '', tags: ['歌'], favorite: false } });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].links.length, 1);
  assert.strictEqual(out[0].name, '花子');
});

ok('generate: standard template with labels + blank separator', () => {
  const entries = [
    Core.normalizeEntry({ name: 'A', links: [{ label: 'YouTube', url: 'https://yt/a' }] }),
    Core.normalizeEntry({ name: 'B', links: [{ label: 'X (旧Twitter)', url: 'https://x/b' }] }),
  ];
  const text = Core.generate(entries, Core.TEMPLATES.standard);
  assert.strictEqual(text, 'A\nYouTube: https://yt/a\n\nB\nX (旧Twitter): https://x/b');
});

ok('generate: numbered + label filter + header/footer', () => {
  const entries = [Core.normalizeEntry({ name: 'A', links: [
    { label: 'YouTube', url: 'u1' }, { label: 'Twitch', url: 'u2' },
  ] })];
  const text = Core.generate(entries, { numbering: true, showLabels: true, separator: 'none', includeLabels: ['YouTube'], header: '▼一覧', footer: '以上' });
  assert.strictEqual(text, '▼一覧\n\n1. A\nYouTube: u1\n\n以上');
});

ok('generate: namesOnly outputs names only', () => {
  const entries = [Core.normalizeEntry({ name: 'A', links: [{ label: 'YouTube', url: 'u1' }] })];
  assert.strictEqual(Core.generate(entries, Core.TEMPLATES.namesOnly), 'A');
});

ok('share code roundtrip keeps Japanese names, tags, notes and links', async () => {
  const entries = [Core.normalizeEntry({
    name: '夜風るる', favorite: true, tags: ['ゲーム', '実況'], notes: 'メモ',
    links: [{ label: 'YouTube', url: 'https://youtube.com/@ruru' }, { label: 'Twitch', url: 'https://twitch.tv/ruru' }],
  })];
  const code = await Core.encodeShareCode(entries);
  assert.ok(code.startsWith('YTV2.'));
  const back = await Core.decodeShareCode(code);
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].name, '夜風るる');
  assert.deepStrictEqual(back[0].tags, ['ゲーム', '実況']);
  assert.strictEqual(back[0].notes, 'メモ');
  assert.deepStrictEqual(back[0].links, entries[0].links);
});

ok('share code decode rejects garbage and empty input', async () => {
  assert.strictEqual(await Core.decodeShareCode(''), null);
  assert.strictEqual(await Core.decodeShareCode('not a code !!!'), null);
  assert.strictEqual(await Core.decodeShareCode('YTV2.####'), null);
});

ok('share code: v2.4.0 format (JSON object) still decodes', async () => {
  const oldPayload = { app: 'YTV2', kind: 'list-share', version: 2, entries: [{ name: '旧太郎', favorite: false, tags: ['ゲーム'], notes: '', links: [{ label: 'YouTube', url: 'https://yt/old' }] }] };
  const oldCode = 'YTV2.' + Buffer.from(JSON.stringify(oldPayload), 'utf-8').toString('base64url');
  const back = await Core.decodeShareCode(oldCode);
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].name, '旧太郎');
  assert.deepStrictEqual(back[0].links, oldPayload.entries[0].links);
});

ok('share code: compact format is much shorter than the v2.4.0 format', async () => {
  const e = Core.normalizeEntry({ name: '夜風るる', favorite: true, tags: ['ゲーム', '実況'], notes: '', links: [
    { label: 'YouTube', url: 'https://youtube.com/@yorukaze_ruru' },
    { label: 'X (旧Twitter)', url: 'https://x.com/yorukaze_ruru' }] });
  const code = await Core.encodeShareCode([e]);
  const oldLen = ('YTV2.' + Buffer.from(JSON.stringify({ app: 'YTV2', kind: 'list-share', version: 2, entries: [e] }), 'utf-8').toString('base64url')).length;
  assert.ok(code.length < oldLen * 0.6, `expected much shorter: ${code.length} vs old ${oldLen}`);
});

Promise.all(pending).then(() => {
  console.log(`\nAll ${passed} tests passed.`);
}).catch(err => { console.error(err); process.exit(1); });
