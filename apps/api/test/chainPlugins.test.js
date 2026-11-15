// What deploy/chain/application-plugins.yml must say for the index to hold what the API reads
// (views.sql): both filters keep only the user tokens of the policy (the label of the shared
// rules), each starts with the guard that stops the sync on a policy id that is not 56 lower-case
// hex characters, and a failing filter stops the sync (exit-on-error) instead of saving the
// unfiltered list. Yaci Store cannot run here; this catches an edit of the file or of the label
// before the owner's first start. (The expressions themselves were run with mvel2 2.5.2.Final, the
// MVEL of Yaci Store 2.0.7: the task K+Y report.)

const fs = require('fs');
const path = require('path');
const { chain: rules } = require('@battlechoc/battlechoc-shared-functions');

const FILE = path.join(__dirname, '..', '..', '..', 'deploy', 'chain', 'application-plugins.yml');
const text = fs.readFileSync(FILE, 'utf8');
// the YAML without its comments
const yaml = text
    .split('\n')
    .filter(line => !/^\s*#/.test(line))
    .join('\n');

// the filters of `key`: [{ name, lang, expression, exitOnError }] (the file's own indentation)
const filtersOf = key => {
    const start = yaml.indexOf(`\n      ${key}:\n`);
    if (start === -1) {
        return [];
    }
    const rest = yaml.slice(start + key.length + 9);
    const block = rest.slice(0, rest.search(/\n {0,6}\S/) === -1 ? rest.length : rest.search(/\n {0,6}\S/));
    return `\n${block}`
        .split('\n        - ')
        .slice(1)
        .map(entry => ({
            name: /name: "([^"]*)"/.exec(entry)?.[1],
            lang: /\n {10}lang: (\S+)/.exec(entry)?.[1],
            expression: (/\n {10}expression: \|\n((?: {12}.*\n?)+)/.exec(entry)?.[1] ?? '')
                .split('\n')
                .map(line => line.slice(12))
                .join('\n'),
            exitOnError: /\n {10}exit-on-error: (\S+)/.exec(entry)?.[1],
        }));
};

describe("the index's plugin filters (deploy/chain/application-plugins.yml)", () => {
    const GUARD = "if ('${CHAIN_POLICY_ID}'.matches('[0-9a-f]{56}') == false) {\n    Integer.parseInt(";
    const USER_UNIT = `'\${CHAIN_POLICY_ID}${rules.USER_LABEL}'`;

    test.each([['utxo.unspent.save'], ['asset.save']])('%s: one MVEL filter of user tokens of the policy, guarded, that stops the sync when it fails', key => {
        const filters = filtersOf(key);
        expect(filters).toHaveLength(1);
        const [filter] = filters;
        expect(filter.lang).toBe('mvel');
        expect(filter.exitOnError).toBe('true');
        expect(filter.expression.startsWith(GUARD)).toBe(true);
        expect(filter.expression).toContain(`.startsWith(${USER_UNIT})`);
        // an asset's unit is read, never its decoded name or the policy alone
        expect(filter.expression).not.toMatch(/assetName|policyId|policy ==/);
    });

    test('the label is the CIP-68 user label, and the plugins as a whole stop the sync on a failure', () => {
        expect(rules.USER_LABEL).toBe('000de140');
        expect(yaml).toMatch(/\n {2}plugins:\n {4}enabled: true\n/);
        expect(yaml).toMatch(/\n {4}exit-on-error: true\n/);
    });
});
