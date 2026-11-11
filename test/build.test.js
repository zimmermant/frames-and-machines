import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, cpSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { stubElement } from './stub-dom.js';
import { strip, scanForDuplicates, main, MODULES, PAGES, BUILD_MARKER, BUDGET_BYTES } from '../build.js';

// build.js only calls main() when it is the program node was invoked on, so importing it here does not build.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = PAGES[0].out;
const scratch = join(repoRoot, '.superpowers', 'task-1', 'build-tests');
mkdirSync(scratch, { recursive:true });

// ---- strip: the two rewrites, as a pure function ----------------------------------------------
test('strip: relative imports (one line or wrapped) and export keywords are removed, declarations kept', () => {
  const out = strip("import { a } from './a.js';\nimport { b,\n  c } from './b.js';\nexport function f() {}\n  export const nope = 1;\nexport { f };\nconst keep = 2;\n");
  assert.ok(!/\bimport\b/.test(out), out);
  assert.ok(!/\bexport\b/.test(out), out);
  assert.ok(!out.includes('c }'), 'the wrapped second line is dropped too');
  assert.ok(out.includes('function f() {}') && out.includes('const keep = 2;') && out.includes('  const nope = 1;'));
});

// ---- scanForDuplicates: the name-collision guard ----------------------------------------------
test('a cross-module duplicate throws and names both files', () => {
  const seen = new Map();
  scanForDuplicates('export const FOO = 1;\n', 'a.js', seen);
  assert.throws(() => scanForDuplicates('export function FOO() {}\n', 'b.js', seen),
    /Duplicate top-level name "FOO" in b\.js; already declared in a\.js/);
});

test('a column-0 destructuring declaration throws', () => {
  assert.throws(() => scanForDuplicates('export const { a, b } = obj;\n', 'weird.js', new Map()), /destructuring/i);
  assert.throws(() => scanForDuplicates('const [first] = list;\n', 'weird2.js', new Map()), /destructuring/i);
});

test('a multi-declarator statement throws, naming the file and the fix', () => {
  const line = 'export const VB = { w: 480, h: 380 }, PAD = 0.12;\n';
  assert.throws(() => scanForDuplicates(line, 'fig.js', new Map()), /fig\.js/);
  assert.throws(() => scanForDuplicates(line, 'fig.js', new Map()), /one name per statement/);
  assert.throws(() => scanForDuplicates('const a = 1, b = 2;\n', 'm.js', new Map()), /one name per statement/);
});

test('a comma inside an object, array, call, string, template or trailing comment is not a second declarator', () => {
  for (const line of [
    "export const COLORS = { a: 'x', b: 'y' };", "export const L = ['a.js', 'b.js'];", 'const f = g(1, 2);',
    "export const M = 'a, b';", 'export const M2 = "a, b";', 'export const M3 = `a, b`;', "export const M4 = 'it\\'s, fine';",
    'export const M5 = 1;  // one, two'
  ]) assert.doesNotThrow(() => scanForDuplicates(line + '\n', 'm.js', new Map()), line);
});

test('an indented function-local const is not a top-level name: it may shadow another module\'s', () => {
  const seen = new Map();
  scanForDuplicates('export function px(x) {\n  return x;\n}\n', 'a.js', seen);
  assert.doesNotThrow(() => scanForDuplicates('export function g() {\n  const px = 1;\n  return px;\n}\n', 'b.js', seen));
  assert.equal(seen.get('px'), 'a.js');
});

// ---- main() against scratch directories OUTSIDE the repo ----------------------------------------
test('main() builds byte-reproducibly, within the byte budget, without touching dist/', () => {
  const dirA = mkdtempSync(join(scratch, 'sim-build-a-'));
  const dirB = mkdtempSync(join(scratch, 'sim-build-b-'));
  try {
    main(dirA);
    main(dirB);
    assert.equal(PAGES.length, 7);
    for (const page of PAGES) {
      const a = readFileSync(join(dirA, page.out));
      const b = readFileSync(join(dirB, page.out));
      assert.ok(a.length > 0 && a.length <= BUDGET_BYTES, `${page.out}: ${a.length} bytes`);
      assert.deepStrictEqual(a, b, 'two builds must be byte-identical');
    }
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('every built page carries the build marker exactly once', () => {
  const dir = mkdtempSync(join(scratch, 'sim-build-m-'));
  try {
    main(dir);
    for (const p of PAGES) assert.equal(readFileSync(join(dir, p.out), 'utf8').split(BUILD_MARKER).length - 1, 1, p.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('main() removes stale pages of an earlier build (.html with the marker, not in PAGES) and nothing else', () => {
  const dir = mkdtempSync(join(scratch, 'sim-build-s-'));
  try {
    writeFileSync(join(dir, 'old_name.html'), `<!DOCTYPE html>\n${BUILD_MARKER}\n<p>an earlier build</p>`);
    writeFileSync(join(dir, 'hand_written.html'), '<!DOCTYPE html><p>not ours: no marker</p>');
    writeFileSync(join(dir, 'notes.txt'), `${BUILD_MARKER} but not an .html file`);
    writeFileSync(join(dir, 'also_old.htm'), `${BUILD_MARKER} wrong extension`);
    main(dir);
    assert.ok(!existsSync(join(dir, 'old_name.html')), 'the stale page is removed');
    assert.ok(existsSync(join(dir, 'hand_written.html')), 'an .html without the marker is left alone');
    assert.ok(existsSync(join(dir, 'notes.txt')) && existsSync(join(dir, 'also_old.htm')), 'only .html files are touched');
    for (const p of PAGES) assert.ok(existsSync(join(dir, p.out)), `${p.out} is written`);
    main(dir);                                       // a second build is a no-op for what is already right
    assert.ok(existsSync(join(dir, 'hand_written.html')));
    for (const p of PAGES) assert.ok(existsSync(join(dir, p.out)), `${p.out} survives its own rebuild`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the built page has no external URL, script or stylesheet, no leftover marker, no import or export line', () => {
  const dir = mkdtempSync(join(scratch, 'sim-build-c-'));
  try {
    main(dir);
    const html = readFileSync(join(dir, OUT), 'utf8');
    assert.ok(!/https?:\/\//.test(html.split('http://www.w3.org/2000/svg').join('')), 'an external URL');
    assert.ok(!/<script[^>]+src=/.test(html), 'an external script');
    assert.ok(!/<link[^>]+href=/.test(html), 'an external stylesheet');
    assert.ok(!html.includes('<!--INLINE_'));
    assert.ok(!/^\s*(import|export)\s/m.test(html.slice(html.indexOf('<script>'))), 'an import or export line survived');
    assert.ok(html.includes('<script>\n(function () {\n"use strict";\n') && html.includes('\n})();\n</script>'), 'one strict IIFE');
    for (const m of MODULES) assert.ok(html.includes(`// ===== ${m} =====`), `${m} is missing`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every src/*.js file is listed in a page\'s module list, and nothing is listed that is not there', () => {
  const files = readdirSync(join(repoRoot, 'src'), { recursive:true }).filter(f => f.endsWith('.js')).sort();
  const listed = new Set(PAGES.flatMap(p => p.modules));
  assert.deepEqual(files.filter(f => !listed.has(f)), [], 'src/ files missing from the build lists');
  assert.deepEqual([...listed].filter(f => !files.includes(f)), [], 'listed but not in src/');
  assert.equal(MODULES.at(-1), 'app.js', 'app.js runs last');
});

// ---- main()'s refusals, against a scratch copy of the build (build.js, package.json, src/) ----
async function inCopy(edit, check) {
  const dir = mkdtempSync(join(scratch, 'sim-copy-'));
  try {
    for (const f of ['src', 'build.js', 'package.json']) cpSync(join(repoRoot, f), join(dir, f), { recursive: true });
    edit(dir);
    const copy = await import(pathToFileURL(join(dir, 'build.js')).href);
    const out = join(dir, 'out');
    return await check(() => copy.main(out), out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const addTo = (file, text) => (dir) => appendFileSync(join(dir, 'src', file), text);
const rewrite = (file, from, to) => (dir) => {
  const p = join(dir, 'src', file);
  const before = readFileSync(p, 'utf8');
  assert.ok(before.includes(from), `${file} lacks ${from}`);
  writeFileSync(p, before.replace(from, () => to));
};

test('main() refuses a duplicate top-level name across modules, and writes nothing', async () => {
  await inCopy((dir) => { addTo('solve.js', '\nexport const SAME = 1;\n')(dir); addTo('app.js', '\nexport const SAME = 2;\n')(dir); }, (run, out) => {
    assert.throws(run, /Duplicate top-level name "SAME" in app\.js; already declared in solve\.js/);
    assert.ok(!existsSync(join(out, OUT)));
  });
});

test('main() refuses destructuring and multi-declarator statements at the top level', async () => {
  await inCopy(addTo('geometry.js', '\nexport const { A_PART } = { A_PART: 1 };\n'), (run) => assert.throws(run, /destructuring/i));
  await inCopy(addTo('geometry.js', '\nexport const ONE = 1, TWO = 2;\n'), (run) => assert.throws(run, /one name per statement/));
});

test('main() refuses a bundle that does not parse', async () => {
  await inCopy(addTo('geometry.js', '\nconst BROKEN_BUNDLE = ;\n'), (run) => {
    assert.throws(run, /the frame-1 page's assembled bundle does not parse and run as JavaScript/);
  });
});

test('main() refuses a template that lost an inline marker', async () => {
  for (const marker of ['<!--INLINE_CSS-->', '<!--INLINE_JS-->']) {
    await inCopy(rewrite('frame.template.html', marker, ''), (run, out) => {
      assert.throws(run, /frame\.template\.html is missing one of its inline markers/);
      assert.ok(!existsSync(join(out, OUT)));
    });
  }
});

test('main() refuses an external URL, script tag or stylesheet', async () => {
  await inCopy(addTo('geometry.js', "\nexport const SOME_REMOTE = 'https://example.org/x.js';\n"), (run) => {
    assert.throws(run, /Build failed \(frame-1 page\)[\s\S]*an external URL is present/);
  });
  await inCopy(rewrite('frame.template.html', '</head>', '<script src="x.js"></script></head>'), (run) => {
    assert.throws(run, /an external script tag is present/);
  });
  await inCopy(rewrite('frame.template.html', '</head>', '<link rel="stylesheet" href="x.css"></head>'), (run) => {
    assert.throws(run, /an external stylesheet is present/);
  });
});

test('main() notices an import or export line that survived strip (inside a template literal, which still parses)', async () => {
  await inCopy(addTo('geometry.js', '\nexport const SURVIVOR = `first\nimport nothing\nexport nothing`;\n'), (run) => {
    assert.throws(run, /an import statement survived[\s\S]*an export statement survived/);
  });
});

test('the budget is measured in bytes: 90,000 three-byte characters are 270,000 bytes though .length says 90,000', async () => {
  await inCopy(addTo('frame.template.html', `\n/* ${'—'.repeat(90_000)} */\n`), (run) => {
    assert.throws(run, /over the 250000-byte budget/);
  });
  await inCopy(addTo('geometry.js', `\nexport const HUGE_TEXT = '${'x'.repeat(260_000)}';\n`), (run) => {
    assert.throws(run, /over the 250000-byte budget/);
  });
});

test('main() splices CSS and JavaScript verbatim: $& and $$ in them are not replacement patterns', async () => {
  const css = "/* dollars: $& $' $` $$ $1 */";
  await inCopy((dir) => {
    appendFileSync(join(dir, 'src', 'frame.template.html'), `\n${css}\n`);
    appendFileSync(join(dir, 'src', 'geometry.js'), `\nexport const DOLLARS = '$& $$ $1';\n`);
  }, (run, out) => {
    run();
    const html = readFileSync(join(out, OUT), 'utf8');
    assert.ok(html.includes(css), 'the CSS arrived unchanged');
    assert.ok(html.includes(`const DOLLARS = '$& $$ $1';`), 'the JavaScript arrived unchanged');
  });
});

test('index is a plain title and exactly six frame links with no script', () => {
  const html = readFileSync(join(repoRoot, 'src/index.template.html'), 'utf8');
  assert.match(html, /<h1>Frames and machines<\/h1>/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.deepEqual([...html.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(m => m.slice(1)),
    Array.from({length:6}, (_, i) => [`frame-${i+1}.html`, `Frame ${i+1}`]));
});

test('all six built pages immediately render nominal combined scenes', () => {
  const dir=mkdtempSync(join(scratch,'sim-static-'));
  try {
    main(dir);
    for (const page of PAGES.filter(p=>!p.plain)) {
      const html=readFileSync(join(dir,page.out),'utf8');
      assert.match(html,/<svg\b[^>]*id="scene"/);
      const svg=stubElement('svg');
      const button=stubElement('button');
      const status=stubElement('p');
      const document={querySelector:selector=>selector==='#scene'?svg:selector==='#status'?status:button,createElementNS:(_,tag)=>stubElement(tag)};
      Object.defineProperty(svg,'ownerDocument',{value:document});
      new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]).runInNewContext({document});
      assert.equal(button.disabled,false);
      assert.equal(button.textContent,'Explode');
      const walk=n=>n.children.flatMap(c=>[c,...walk(c)]);
      const all=walk(svg);
      assert.ok(all.some(n=>n.classList.contains('member')),page.out);
      assert.ok(all.some(n=>n.classList.contains('load-force')),page.out);
      assert.equal(all.filter(n=>n.classList.contains('pin-force')).length,0);
      assert.doesNotMatch(svg.textContent,/\d/);
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('each frame page has its own title and figure label; the index is unchanged', () => {
  const dir=mkdtempSync(join(scratch,'sim-title-'));
  try {
    main(dir);
    for (let n=1;n<=6;n++) {
      const html=readFileSync(join(dir,`frame-${n}.html`),'utf8');
      assert.match(html,new RegExp(`<title>Frame ${n} \u2014 frames and machines</title>`));
      assert.match(html,new RegExp(`<svg id="scene" role="group" aria-label="Frame ${n} and its forces">`));
      assert.doesNotMatch(html,/\{\{N\}\}|<title>Frames and machines/);
      assert.match(html,/<p id="status" role="status" aria-live="polite" class="visually-hidden"><\/p>/);
    }
    assert.match(readFileSync(join(dir,'index.html'),'utf8'),/<title>Frames and machines<\/title>/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
