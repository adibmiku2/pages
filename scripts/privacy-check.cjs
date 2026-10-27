#!/usr/bin/env node
'use strict';
// Blocks private data and unexpected files from entering this public repository. Reports file, line and category only, never the value.
// Modes: --staged (pre-commit), --push (pre-push, reads refs on stdin), --tree (every file git would track).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 << 20 });
// The only files this repository may hold. Keep in step with .gitignore.
const ALLOWED = new Set(['.gitignore', 'README.md', 'index.html', 'privacy.html',
    'scripts/privacy-check.cjs', 'scripts/git-hooks/pre-commit', 'scripts/git-hooks/pre-push']);
const NOREPLY = /@users\.noreply\.github\.com$/i;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = t => new RegExp(`(?<![A-Za-z0-9_])${escape(t)}(?![A-Za-z0-9_])`, 'gi');

function rules() {
    const list = [];
    const deny = path.join(root, 'private/denylist.txt');
    if (fs.existsSync(deny)) {
        for (const line of fs.readFileSync(deny, 'utf8').split(/\r?\n/)) {
            const t = line.trim();
            if (t && !t.startsWith('#')) list.push({ category: 'private term (private/denylist.txt)', re: word(t) });
        }
    }
    // A missing or emptied denylist would let the owner's name through silently, so refuse to pass.
    if (!list.length) {
        console.error('privacy-check: BLOCKED. private/denylist.txt is missing or has no terms; recreate it first.');
        process.exit(1);
    }
    list.push({ category: 'Windows user folder', re: /[A-Za-z]:\\Users\\[^\\\s"'`]+/gi });
    list.push({ category: 'IP address', re: /\b(?:192\.168|10)\.\d{1,3}\.\d{1,3}\b|\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/g });
    list.push({ category: 'phone number', re: /(?<!\d)(?:\+?61[\s-]?|0)4(?:[\s-]?\d){8}(?!\d)|(?<!\d)(?:\+?62|0)[\s.-]?8(?:[\s.-]?\d){7,11}(?!\d)/g });
    return list;
}

function findings(rel, buf, list) {
    const out = [];
    if (!ALLOWED.has(rel)) out.push({ rel, line: 0, category: 'file not on the allow-list' });
    if (buf.includes(0)) return out;
    const text = rel + '\n' + buf.toString('utf8');
    const lineOf = i => text.slice(0, i).split('\n').length - 1;
    const hit = (i, category) => out.push({ rel, line: lineOf(i), category });
    for (const { category, re } of list) for (const m of text.matchAll(re)) hit(m.index, category);
    for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g))
        if (!NOREPLY.test(m[0]) && !/@example\.(com|org)$/i.test(m[0])) hit(m.index, 'email address');
    return out;
}

const split0 = buf => buf.toString('utf8').split('\0').filter(Boolean);
const mode = process.argv[2];
const list = rules();
const problems = [];

if (mode === '--staged') {
    for (const rel of split0(git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR')))
        problems.push(...findings(rel, git('show', `:${rel}`), list));
} else if (mode === '--tree') {
    for (const rel of split0(git('ls-files', '-co', '--exclude-standard', '-z')))
        if (fs.existsSync(path.join(root, rel))) problems.push(...findings(rel, fs.readFileSync(path.join(root, rel)), list));
} else if (mode === '--push') {
    const input = fs.readFileSync(0, 'utf8');
    const seen = new Set();
    for (const line of input.split(/\r?\n/).filter(Boolean)) {
        const [, localSha] = line.split(' ');
        if (!localSha || /^0+$/.test(localSha)) continue;
        for (const c of git('rev-list', localSha, '--not', '--remotes').toString().split(/\s+/).filter(Boolean)) {
            if (seen.has(c)) continue;
            seen.add(c);
            const [author, committer] = git('log', '-1', '--format=%ae%n%ce', c).toString().trim().split('\n');
            if (!NOREPLY.test(author) || !NOREPLY.test(committer))
                problems.push({ rel: `commit ${c.slice(0, 8)}`, line: 0, category: 'author or committer email is not the GitHub noreply address' });
            for (const rel of split0(git('diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--root', '--diff-filter=ACMR', c)))
                problems.push(...findings(rel, git('show', `${c}:${rel}`), list));
        }
    }
} else {
    console.error('Usage: node scripts/privacy-check.cjs --staged | --push | --tree');
    process.exit(2);
}

if (problems.length) {
    console.error('privacy-check: BLOCKED. Private data or an unexpected file found:');
    const unique = [...new Map(problems.map(p => [`${p.rel}:${p.line}:${p.category}`, p])).values()];
    for (const p of unique) console.error(`  ${p.rel}${p.line ? ':' + p.line : ''}  ${p.category}`);
    console.error('Remove it or replace it with dummy data. Never bypass this check with --no-verify.');
    process.exit(1);
}
console.log(`privacy-check: clean (${mode.slice(2)})`);
