// node --test .github/scripts/pr-changelog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { entryOf, sectionFor, withSection, commitsOf, START, END } = require('./pr-changelog');

test('a conventional commit gives its subject as the entry', () => {
    assert.equal(entryOf('feat(pwa): the AI ladder\n\nTwo wins up, a loss down.'), 'feat(pwa): the AI ladder');
    assert.equal(entryOf('fix: naming works offline'), 'fix: naming works offline');
});

test('anything else gives no entry', () => {
    ['Update README.md', "Merge branch 'x' into dev", 'wip', 'feature: no known type', 'feat:missing space', 'deps: not a type release-please splits at'].forEach(message => {
        assert.equal(entryOf(message), null, message);
    });
});

test('a breaking change is marked with a footer, since release-please splits a list only before "type(scope): "', () => {
    assert.equal(entryOf('refactor(api)!: device accounts only'), 'refactor(api): device accounts only\n\nBREAKING CHANGE: device accounts only');
    assert.equal(entryOf('feat!: challenge links'), 'feat: challenge links\n\nBREAKING CHANGE: challenge links');
    assert.equal(entryOf('feat(api): new protocol\n\nSome words.\n\nBREAKING CHANGE: old clients cannot join'), 'feat(api): new protocol\n\nBREAKING CHANGE: old clients cannot join');
});

test('the section holds one entry per conventional commit, oldest first, and lists the others apart', () => {
    const section = sectionFor([
        { sha: 'a'.repeat(40), message: 'feat(shared): the AI ladder' },
        { sha: 'b'.repeat(40), message: 'Update README.md\n\nby hand' },
        { sha: 'c'.repeat(40), message: 'fix(pwa): naming works offline' },
    ]);
    assert.ok(section.startsWith(START));
    assert.ok(section.endsWith(END));
    const override = section.split('BEGIN_COMMIT_OVERRIDE\n')[1].split('\nEND_COMMIT_OVERRIDE')[0];
    assert.equal(override, 'feat(shared): the AI ladder\n\nfix(pwa): naming works offline');
    assert.match(section.split('END_COMMIT_OVERRIDE')[1], /Not in the changelog[^\n]*\n- bbbbbbb Update README\.md/);
    // release-please reads the first BEGIN_COMMIT_OVERRIDE of the description: nothing above may name it
    assert.equal(section.split('BEGIN_COMMIT_OVERRIDE').length, 2);
});

test('without a conventional commit the section has no override and says so', () => {
    const section = sectionFor([{ sha: 'b'.repeat(40), message: 'Update README.md' }]);
    assert.ok(!section.includes('BEGIN_COMMIT_OVERRIDE'));
    assert.match(section, /nothing for the changelog/);
});

test('the section replaces the old one and keeps the rest of the description', () => {
    const first = sectionFor([{ sha: 'a'.repeat(40), message: 'feat: one' }]);
    const second = sectionFor([
        { sha: 'a'.repeat(40), message: 'feat: one' },
        { sha: 'c'.repeat(40), message: 'fix: two' },
    ]);
    assert.equal(withSection('', first), first);
    assert.equal(withSection(null, first), first);
    const body = withSection('Play test fixes.', first);
    assert.equal(body, `Play test fixes.\n\n${first}`);
    assert.equal(withSection(`${body}\n\nMore words.`, second), `Play test fixes.\n\n${second}\n\nMore words.`);
});

// a scratch repository: main, then a branch with commits and a merge, merged once (squash) and continued
test('the commits of a pull request leave out merges and what an earlier merged pull request of the branch held', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-changelog-'));
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    const commit = message => {
        fs.writeFileSync(path.join(dir, 'file.txt'), `${message}\n`, { flag: 'a' });
        git('add', 'file.txt');
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', message);
        return git('rev-parse', 'HEAD');
    };
    git('init', '-q');
    git('symbolic-ref', 'HEAD', 'refs/heads/main');
    const base = commit('chore: start');
    git('switch', '-q', '-c', 'feature');
    commit('feat: one');
    git('switch', '-q', '-c', 'dev', 'main');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'merge', '-q', '--no-ff', '-m', "Merge branch 'feature' into dev", 'feature');
    const firstHead = commit('fix: two');
    const later = commit('feat: three');

    const messages = commits => commits.map(c => c.message.split('\n')[0]);
    assert.deepEqual(messages(commitsOf({ cwd: dir, base, head: later, earlierHeads: [] })), ['feat: one', 'fix: two', 'feat: three']);
    assert.deepEqual(messages(commitsOf({ cwd: dir, base, head: later, earlierHeads: [firstHead] })), ['feat: three']);
    // a head that is not in the history (dev restarted from main) changes nothing
    assert.deepEqual(messages(commitsOf({ cwd: dir, base, head: later, earlierHeads: ['f'.repeat(40)] })), ['feat: one', 'fix: two', 'feat: three']);
    fs.rmSync(dir, { recursive: true, force: true });
});

// every new description starts as .github/PULL_REQUEST_TEMPLATE.md
test('the pull request template names no marker and no override, and no line of it reads like a commit', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'PULL_REQUEST_TEMPLATE.md'), 'utf8');
    [START, END, 'BEGIN_COMMIT_OVERRIDE', 'END_COMMIT_OVERRIDE', 'BREAKING CHANGE', 'BREAKING-CHANGE'].forEach(text => {
        assert.ok(!template.includes(text), text);
    });
    // without an override (a pull request from a fork) release-please reads the description as the body of the squash commit
    template.split('\n').forEach(line => assert.equal(entryOf(line.replace(/^[\s*-]+/, '')), null, line));
    const section = sectionFor([{ sha: 'a'.repeat(40), message: 'feat: one' }]);
    assert.equal(withSection(template, section), `${template.trim()}\n\n${section}`);
});
