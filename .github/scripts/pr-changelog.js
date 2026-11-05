// The changelog of a pull request, written into its description by CI (ci.yml, job changelog):
// one release-please entry (BEGIN_COMMIT_OVERRIDE) per conventional commit, so the squash merge of
// a whole batch (dev → main) keeps every change, whatever the title. Merge commits and commits an
// earlier merged pull request of the same branch already held are left out; commits without a
// conventional message are listed apart, so nothing drops out unseen.

const { execFileSync, spawnSync } = require('child_process');

// the types release-please splits a list of messages at (src/commit.ts, splitMessages); it does
// not split before "type!: ", so a breaking change gets a footer instead
const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([^()\\r\\n]*\\))?(!)?: (\\S.*)$`);
const BREAKING = /^BREAKING[ -]CHANGE: (.+)$/m;

const START = '<!-- changelog: start (written by CI from the commits; a new push writes it anew) -->';
const END = '<!-- changelog: end -->';

/** The changelog entry of a commit message, or null when the message is not conventional. */
const entryOf = message => {
    const [subject, ...rest] = message.trim().split('\n');
    const match = HEADER.exec(subject.trim());
    if (!match) {
        return null;
    }
    const [, type, scope = '', bang, description] = match;
    const footer = BREAKING.exec(rest.join('\n'));
    if (!bang && !footer) {
        return subject.trim();
    }
    return `${type}${scope}: ${description}\n\nBREAKING CHANGE: ${footer ? footer[1] : description}`;
};

/** The changelog section of a description for these commits ({ sha, message }, oldest first). */
const sectionFor = commits => {
    const entries = [];
    const others = [];
    commits.forEach(({ sha, message }) => {
        const entry = entryOf(message);
        if (entry) {
            entries.push(entry);
        } else {
            others.push(`- ${sha.slice(0, 7)} ${message.trim().split('\n')[0]}`);
        }
    });
    const lines = [START, '### Changelog', ''];
    if (entries.length > 0) {
        lines.push('BEGIN_COMMIT_OVERRIDE', entries.join('\n\n'), 'END_COMMIT_OVERRIDE');
    } else {
        lines.push('No conventional commits: nothing for the changelog.');
    }
    if (others.length > 0) {
        lines.push('', 'Not in the changelog (no conventional commit message):', ...others);
    }
    lines.push(END);
    return lines.join('\n');
};

/** The description with its changelog section replaced, or added at the end. */
const withSection = (body, section) => {
    const text = (body || '').trim();
    const start = text.indexOf(START);
    const end = text.indexOf(END, start);
    if (start >= 0 && end >= 0) {
        return `${text.slice(0, start)}${section}${text.slice(end + END.length)}`;
    }
    return text ? `${text}\n\n${section}` : section;
};

const isAncestor = (cwd, ancestor, head) => spawnSync('git', ['merge-base', '--is-ancestor', ancestor, head], { cwd, stdio: 'ignore' }).status === 0;

/**
 * The commits of a pull request (base..head, oldest first) without merge commits and without the
 * commits of earlier merged pull requests from the same branch (their heads, when still in the
 * history: the branch went on after a squash merge instead of starting again from main).
 */
const commitsOf = ({ cwd = process.cwd(), base, head, earlierHeads }) => {
    const excluded = earlierHeads.filter(sha => isAncestor(cwd, sha, head)).map(sha => `^${sha}`);
    const log = execFileSync('git', ['log', '--no-merges', '--reverse', '--format=%H%x00%B%x1e', `${base}..${head}`, ...excluded], {
        cwd,
        encoding: 'utf8',
    });
    return log
        .split('\x1e')
        .map(record => record.trim())
        .filter(Boolean)
        .map(record => {
            const [sha, message] = record.split('\0');
            return { sha, message };
        });
};

const main = () => {
    const { PR_NUMBER, BASE_SHA, HEAD_SHA, HEAD_REF, GITHUB_REPOSITORY } = process.env;
    const gh = (args, input) => execFileSync('gh', [...args, '--repo', GITHUB_REPOSITORY], { encoding: 'utf8', input });
    const earlier = JSON.parse(gh(['pr', 'list', '--state', 'merged', '--head', HEAD_REF, '--json', 'headRefOid', '--limit', '100']));
    const commits = commitsOf({ base: BASE_SHA, head: HEAD_SHA, earlierHeads: earlier.map(pr => pr.headRefOid) });
    const { body } = JSON.parse(gh(['pr', 'view', PR_NUMBER, '--json', 'body']));
    const section = sectionFor(commits);
    console.log(section);
    const next = withSection(body, section);
    if (next !== (body || '').trim()) {
        gh(['pr', 'edit', PR_NUMBER, '--body-file', '-'], next);
    }
};

if (require.main === module) {
    main();
}

module.exports = { entryOf, sectionFor, withSection, commitsOf, START, END };
