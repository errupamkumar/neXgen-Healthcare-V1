/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Packages a built application into a single deployable tarball.
 *
 *   npm run package
 *
 * Run this on your workstation (Windows, macOS or Linux). It produces
 * build/nexgen-<timestamp>.tar.gz containing only what the VM needs:
 *
 *   dist/               the compiled client, dist/server.cjs and BUILD_INFO.json
 *   package.json        production dependency manifest (3 packages)
 *   package-lock.json   so the VM can `npm ci --omit=dev` reproducibly
 *   deploy/             the deployment script itself
 *
 * node_modules is deliberately excluded: it holds platform-native binaries
 * (win32-x64-msvc builds on this machine) that cannot run on a Linux VM. The VM
 * installs its own Linux-native copies from the lockfile.
 *
 * Note there is no staging directory — tar archives the paths straight from the
 * source tree. Copying into build/stage first proved fragile on Windows, where
 * an indexer or AV can hold a handle and make the cleanup fail with EPERM.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');

const fail = (msg) => {
  console.error(`\n  ✘ ${msg}\n`);
  process.exit(1);
};
const step = (msg) => console.log(`==> ${msg}`);
const ok = (msg) => console.log(`  ✔ ${msg}`);

// --- 1. Verify the build actually happened -------------------------------
for (const rel of ['dist/server.cjs', 'dist/index.html']) {
  if (!existsSync(join(root, rel))) {
    fail(`${rel} is missing — run "npm run build" first (or just "npm run package").`);
  }
}
if (!existsSync(join(root, 'package-lock.json'))) {
  fail('package-lock.json is missing — the VM needs it for a reproducible npm ci.');
}

// --- 2. Stamp the build ---------------------------------------------------
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

writeFileSync(
  join(root, 'dist', 'BUILD_INFO.json'),
  JSON.stringify(
    {
      name: pkg.name,
      builtAt: new Date().toISOString(),
      builtOn: `${process.platform}-${process.arch}`,
      node: process.version,
      runtimeDependencies: Object.keys(pkg.dependencies || {}),
    },
    null,
    2
  ) + '\n'
);

// --- 3. Archive ------------------------------------------------------------
mkdirSync(buildDir, { recursive: true });
const artifact = join(buildDir, `nexgen-${stamp}.tar.gz`);

step('Creating archive');
try {
  execFileSync(
    'tar',
    [
      '-C', root,
      // The client source map roughly doubles the payload; the much smaller
      // server map is kept because it makes production stack traces readable.
      '--exclude', 'dist/assets/*.map',
      '-czf', artifact,
      'dist', 'package.json', 'package-lock.json', 'deploy',
    ],
    { stdio: 'inherit' }
  );
} catch (err) {
  fail(`tar failed (${err.message}). Windows 10+, macOS and Linux all ship a usable tar.`);
}

// A checksum sidecar. deploy.sh verifies it when present, which turns a
// truncated or mangled upload into a clear message instead of "gzip: stdin:
// not in gzip format" from tar.
const bytes = readFileSync(artifact);
const sha256 = createHash('sha256').update(bytes).digest('hex');
writeFileSync(`${artifact}.sha256`, `${sha256}  ${artifact.split(/[\\/]/).pop()}\n`);

const mb = (bytes.length / 1024 / 1024).toFixed(1);
ok(`build/${artifact.split(/[\\/]/).pop()}  (${mb} MB, ${bytes.length} bytes)`);
ok(`sha256 ${sha256}`);

// --- 4. Tell the operator what to do next --------------------------------
const name = artifact.split(/[\\/]/).pop();
console.log(`
Next — first deploy to a fresh VM:

  scp build/${name} build/${name}.sha256 deploy@vm-host:/tmp/
  ssh deploy@vm-host
  cd /tmp && sha256sum -c ${name}.sha256      # confirm the upload survived
  mkdir -p ~/nexgen && tar -C ~/nexgen -xzf /tmp/${name}
  chmod +x ~/nexgen/deploy/deploy.sh
  sudo GEMINI_API_KEY='your-key' SERVER_NAME='clinic.example.com' ~/nexgen/deploy/deploy.sh setup
  sudo ARTIFACT=/tmp/${name} ~/nexgen/deploy/deploy.sh release

Every deploy after that:

  scp build/${name} build/${name}.sha256 deploy@vm-host:/tmp/
  ssh deploy@vm-host "sudo ARTIFACT=/tmp/${name} /opt/nexgen-health/current/deploy/deploy.sh release"
`);
