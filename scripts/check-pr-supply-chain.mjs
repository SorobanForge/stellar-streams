#!/usr/bin/env node
// Heuristic supply-chain guard for pull requests.
//
// ClamAV (the `clamav` job in .github/workflows/malware-scan.yml) catches known
// malware by signature. This script covers the attack vectors that have no
// signature yet:
//
//   * lifecycle scripts (preinstall/install/postinstall/...) added to a manifest
//   * package manager registry/auth overrides
//   * committed executables
//   * download-and-execute one-liners
//   * new dependencies that run install scripts
//
// Hard findings fail the check. Patterns that are merely suspicious are emitted
// as warning annotations so a reviewer can look at them without blocking a
// legitimate change.
//
// Usage:
//   node scripts/check-pr-supply-chain.mjs [--base <git-ref>]
//
// In CI the base ref comes from GITHUB_BASE_REF; locally it defaults to
// origin/main. The diff covers the working tree as well, so the check can be
// run before committing.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';

const LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
];

/** Commands that turn a lifecycle script into remote code execution. */
const DANGEROUS_SCRIPT =
  /(curl|wget|Invoke-WebRequest|Invoke-Expression|IEX|eval|base64|node\s+-e|https?:\/\/)/i;

/** Settings that can redirect installs to an attacker-controlled registry. */
const REGISTRY_SETTING =
  /^\s*(registry|@[^:\s]+:registry|_auth|_authToken|always-auth|node-options|cafile|strict-ssl)\s*[=:]/i;

/** New dependencies that will not come from the public npm registry. */
const NON_REGISTRY_SPEC = /^(https?|git|ssh|file):|\.(tgz|tar\.gz|zip)$/i;

/** One-liners that download and execute code. Reported, not failed. */
const SUSPICIOUS_PATTERNS = [
  ['curl/wget piped into a shell', /(curl|wget)[^|\n]*\|\s*(sudo\s+)?(ba|z|k)?sh\b/],
  ['PowerShell download cradle', /IEX\s*\(\s*New-Object\s+Net\.WebClient/],
  ['base64-decoded shell payload', /base64\s+(-d|--decode)[^\n|]*\|\s*(sudo\s+)?(ba)?sh\b/],
  ['eval of decoded input', /\beval\s*\(\s*(atob|Buffer\.from)\s*\(/],
  ['dynamic Function construction', /\bnew\s+Function\s*\(/],
  ['shell exec inside Node', /child_process[^\n]*\.exec(Sync)?\s*\([^)]*(curl|wget)/],
];

const EXECUTABLE_EXTENSION = /\.(exe|dll|sys|scr|com|msi|msix|jar|so|dylib|wasm)$/i;

/** Magic numbers for native executables and wasm modules. */
const EXECUTABLE_MAGIC = [
  { bytes: [0x7f, 0x45, 0x4c, 0x46], kind: 'ELF executable' },
  { bytes: [0x4d, 0x5a], kind: 'Windows PE executable' },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], kind: 'Mach-O executable' },
  { bytes: [0xce, 0xfa, 0xed, 0xfe], kind: 'Mach-O executable' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], kind: 'Mach-O 64-bit executable' },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], kind: 'Mach-O universal binary' },
  { bytes: [0x00, 0x61, 0x73, 0x6d], kind: 'WebAssembly module' },
];

const failures = [];
const warnings = [];

const fail = (message, location = '') => failures.push({ message, location });
const warn = (message, location = '') => warnings.push({ message, location });

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function gitOrNull(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

/** Resolves the commit to diff against, preferring an explicit --base. */
function resolveBaseRef() {
  const flag = process.argv.indexOf('--base');
  const explicit = flag !== -1 ? process.argv[flag + 1] : process.env.GITHUB_BASE_REF;
  const candidates = [
    explicit,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null,
    'origin/main',
    'origin/master',
    'main',
    'master',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (gitOrNull(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`])) {
      return candidate;
    }
  }

  console.error('Could not resolve a base branch to diff against. Pass --base <git-ref>.');
  process.exit(2);
}

/** Returns the changed files with their status letter (A, M, R, ...). */
function changedFiles(base) {
  const output = git(['diff', '--name-status', '--diff-filter=ACMR', base]);
  const files = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const [status, ...paths] = line.split('\t');
    // Renames are reported as "R100\told\tnew"; the new path is what we inspect.
    files.push({ status: status[0], path: paths[paths.length - 1] });
  }
  return files;
}

/** Reads a file at the base commit, or null when it did not exist there. */
function readAtBase(base, path) {
  return gitOrNull(['show', `${base}:${path}`]);
}

/** Reads a file from the working tree, or null when it was deleted. */
function readWorkingTree(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

/** Added lines of a single file, ignoring the diff header. */
function addedLines(base, path) {
  const diff = gitOrNull(['diff', '-U0', base, '--', path]);
  if (!diff) return [];
  const lines = [];
  let lineNumber = 0;
  for (const raw of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      lines.push({ text: raw.slice(1), line: lineNumber });
      lineNumber += 1;
    } else if (!raw.startsWith('-') && !raw.startsWith('\\')) {
      lineNumber += 1;
    }
  }
  return lines;
}

/** Parses JSON without throwing; malformed manifests are reported as failures. */
function parseJson(path, content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    fail(`is not valid JSON (${error.message})`, path);
    return null;
  }
}

function checkManifest(base, path) {
  const before = readAtBase(base, path);
  const after = readWorkingTree(path);
  if (after === null) return;

  const previous = before ? parseJson(`${path} (base)`, before) : {};
  const current = parseJson(path, after);
  if (!current) return;

  const oldScripts = previous?.scripts ?? {};
  const newScripts = current.scripts ?? {};

  for (const name of LIFECYCLE_SCRIPTS) {
    const oldCommand = oldScripts[name];
    const newCommand = newScripts[name];
    if (typeof newCommand !== 'string') continue;

    if (typeof oldCommand !== 'string') {
      fail(
        `adds a "${name}" lifecycle script (${JSON.stringify(newCommand)}). ` +
          'Lifecycle scripts run automatically on install; a maintainer must review this by hand.',
        path,
      );
    } else if (newCommand !== oldCommand && DANGEROUS_SCRIPT.test(newCommand)) {
      fail(
        `changes the "${name}" lifecycle script to run a download or eval command ` +
          `(${JSON.stringify(newCommand)}).`,
        path,
      );
    }
  }

  const dependencyFields = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];
  for (const field of dependencyFields) {
    const oldDeps = previous?.[field] ?? {};
    const newDeps = current[field] ?? {};
    for (const [name, spec] of Object.entries(newDeps)) {
      if (typeof spec !== 'string' || oldDeps[name] === spec) continue;
      if (NON_REGISTRY_SPEC.test(spec)) {
        warn(`adds dependency "${name}" from a non-registry source (${spec}).`, path);
      }
    }
  }
}

function checkRegistryConfig(base, path) {
  const before = readAtBase(base, path) ?? '';
  const after = readWorkingTree(path);
  if (after === null) return;

  const previousLines = new Set(before.split('\n'));
  for (const { text, line } of addedLines(base, path)) {
    if (!REGISTRY_SETTING.test(text)) continue;
    if (previousLines.has(text)) continue;
    fail(
      `adds a package-manager setting that can redirect or authenticate installs: ${text.trim()}`,
      { path, line },
    );
  }

  if (before === '') {
    warn('is a new package-manager config file; review every setting in it.', path);
  }
}

function checkExecutable({ status, path }) {
  let magic = null;
  if (existsSync(path) && statSync(path).isFile()) {
    const probe = readFileSync(path);
    for (const candidate of EXECUTABLE_MAGIC) {
      if (candidate.bytes.every((byte, index) => probe[index] === byte)) {
        magic = candidate.kind;
        break;
      }
    }
  }

  if (!EXECUTABLE_EXTENSION.test(path) && !magic) return;

  const detail = magic ? `contains a ${magic}` : 'has an executable file extension';
  if (status === 'A') {
    fail(
      `adds a committed binary: ${detail}. Build output does not belong in the repository.`,
      path,
    );
  } else {
    warn(`modifies a file that ${detail}.`, path);
  }
}

function checkSuspiciousLines(base, path) {
  for (const { text, line } of addedLines(base, path)) {
    for (const [label, pattern] of SUSPICIOUS_PATTERNS) {
      if (pattern.test(text)) {
        warn(`${label}: ${text.trim().slice(0, 160)}`, { path, line });
      }
    }
  }
}

function checkLockfile(base, path) {
  if (path !== 'pnpm-lock.yaml') return;
  const before = readAtBase(base, path) ?? '';
  const after = readWorkingTree(path);
  if (after === null) return;

  const count = (text) => (text.match(/requiresBuild:\s*true/g) ?? []).length;
  const delta = count(after) - count(before);
  if (delta > 0) {
    warn(
      `adds ${delta} dependency(ies) that run install scripts (requiresBuild), ` +
        'which can execute arbitrary code at install time.',
      path,
    );
  }
}

const baseRef = resolveBaseRef();
// Diff against the base tip, not its merge base. On `pull_request` the checked
// out commit already contains the base branch, so this reports only what the PR
// adds. A merge-base diff would also resurrect files that landed on main after
// the branch was cut.
const baseCommit = git(['rev-parse', `${baseRef}^{commit}`]).trim();
const files = changedFiles(baseCommit);

const MANIFEST = /(^|\/)package\.json$/;
const REGISTRY_CONFIG = /(^|\/)(\.npmrc|\.yarnrc|\.yarnrc\.yml|\.pnpmfile\.cjs)$/;
const LOCKFILE = /(^|\/)pnpm-lock\.yaml$/;

for (const file of files) {
  const { path } = file;
  if (MANIFEST.test(path)) checkManifest(baseCommit, path);
  if (REGISTRY_CONFIG.test(path)) checkRegistryConfig(baseCommit, path);
  if (LOCKFILE.test(path)) checkLockfile(baseCommit, path);
  checkExecutable(file);
  checkSuspiciousLines(baseCommit, path);
}

const annotate = (level, { message, location }) => {
  if (typeof location === 'string') {
    console.log(`::${level} file=${location}::${message}`);
  } else {
    console.log(`::${level} file=${location.path},line=${location.line}::${message}`);
  }
};

for (const failure of failures) annotate('error', failure);
for (const warning of warnings) annotate('warning', warning);

const summary = [
  '### Supply-chain check',
  '',
  `Compared \`${baseCommit.slice(0, 7)}\` (${baseRef}) against the pull request: **${files.length}** changed file(s).`,
  '',
  failures.length === 0
    ? 'No blocking findings.'
    : `**${failures.length}** blocking finding(s):\n\n${failures
        .map((entry) => `- \`${entry.location?.path ?? entry.location}\`: ${entry.message}`)
        .join('\n')}`,
  warnings.length === 0
    ? ''
    : `\n**${warnings.length}** warning(s) worth a look:\n\n${warnings
        .map((entry) => {
          const where = entry.location?.path ?? entry.location;
          return `- \`${where}\`: ${entry.message}`;
        })
        .join('\n')}`,
  '',
  'Binaries are also scanned for known malware by ClamAV in the `Scan PR for Malware` job.',
];

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
}

console.log(summary.filter(Boolean).join('\n'));

if (failures.length > 0) {
  console.error(`Supply-chain check failed with ${failures.length} blocking finding(s).`);
  process.exit(1);
}

console.log(`Supply-chain check passed (${warnings.length} warning(s)).`);
