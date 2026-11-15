// Fetches the current preprod protocol parameters through the Evolution SDK's Koios provider (no
// key needed) and writes them to test/fixtures/chain/preprod-params.json, bigints as strings
// (test/helpers/chain.js loadParams() turns them back). Run once when the fixture should follow
// preprod: node scripts/chain/snapshot-params.js
const fs = require('fs');
const path = require('path');
const { Client, preprod } = require('@evolution-sdk/evolution');

const KOIOS_PREPROD = 'https://preprod.koios.rest/api/v1';
const FIXTURE = path.join(__dirname, '..', '..', 'test', 'fixtures', 'chain', 'preprod-params.json');

const main = async () => {
    const params = await Client.make(preprod).withKoios({ baseUrl: KOIOS_PREPROD }).getProtocolParameters();
    const json = JSON.stringify(params, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2);
    fs.writeFileSync(FIXTURE, `${json}\n`);
    console.log(`wrote ${path.relative(process.cwd(), FIXTURE)}`);
};

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
