/**
 * Builds docs/user-manual.html — a single self-contained page.
 *
 * `manual.html` is the authored source. It holds `__SHOT:<name>__` placeholders
 * where screenshots belong; this script swaps each one for a base64 data URI of
 * `screenshots/<name>.jpg`, then wraps the result in a full HTML document.
 *
 * Everything is inlined deliberately: the manual has to open from a file path,
 * an email attachment or an intranet share with no server and no network.
 *
 *   node docs/src/build.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'manual.html');
const shotDir = join(here, 'screenshots');
const output = resolve(here, '..', 'user-manual.html');

const SIZE_WARN_MB = 8;

let body = readFileSync(source, 'utf8');

const missing = new Set();
const embedded = new Set();

body = body.replace(/__SHOT:([a-z0-9-]+)__/gi, (_match, name) => {
  const file = join(shotDir, `${name}.jpg`);
  if (!existsSync(file)) {
    missing.add(name);
    return '';
  }
  embedded.add(name);
  return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
});

if (missing.size) {
  console.error(`Missing screenshots in ${shotDir}:`);
  for (const name of missing) console.error(`  - ${name}.jpg`);
  process.exit(1);
}

// The source is authored as page content only, so that the same file can be
// published as an Artifact (which supplies its own document shell). Saving it
// to disk means supplying that shell here.
const title = (body.match(/<title>([^<]*)<\/title>/i) || [])[1] || 'neXgen Healthcare — Operating Manual';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="Operating manual for neXgen Healthcare: patients, consultants, front desk and administrators, including the appointment booking flow." />
<title>${title}</title>
</head>
<body>
${body}
</body>
</html>
`;

writeFileSync(output, html, 'utf8');

const mb = Buffer.byteLength(html, 'utf8') / 1024 / 1024;
console.log(`embedded ${embedded.size} screenshots`);
console.log(`wrote ${output} (${mb.toFixed(2)} MB)`);
if (mb > SIZE_WARN_MB) {
  console.warn(`warning: over ${SIZE_WARN_MB} MB — consider re-encoding screenshots at lower quality`);
}
