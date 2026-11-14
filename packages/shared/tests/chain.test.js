const { chain, Items, Tier } = require('../index');

describe('the minting constants', () => {
    test('the rules of who may mint and how often', () => {
        expect(chain.MINT_MIN_ONLINE_MATCHES).toBe(10);
        expect(chain.MINTS_PER_DAY).toBe(3);
        expect(chain.WALLET_HOP_WAIT_MS).toBe(24 * 60 * 60 * 1000);
    });

    test('the windows of a transaction: 10 minutes to sign, valid for 20', () => {
        expect(chain.SIGN_WINDOW_MS).toBe(10 * 60 * 1000);
        expect(chain.TX_VALIDITY_MS).toBe(20 * 60 * 1000);
    });

    test('the lovelace a wallet keeps aside, as numbers (they go to JSON and the browser)', () => {
        expect(chain.COLLATERAL_LOVELACE).toBe(2_000_000);
        expect(chain.CHANGE_RESERVE_LOVELACE).toBe(1_000_000);
        expect(typeof chain.COLLATERAL_LOVELACE).toBe('number');
        expect(typeof chain.CHANGE_RESERVE_LOVELACE).toBe('number');
    });

    test('the tiers index a fee option amounts in the order of Tier', () => {
        expect(chain.TIER_ORDER).toEqual(['COMMON', 'RARE', 'EPIC']);
        expect(chain.TIER_ORDER).toEqual(Object.keys(Tier));
        expect(Object.isFrozen(chain.TIER_ORDER)).toBe(true);
    });

    test('the CIP-67 labels of the reference token (100) and the user token (222)', () => {
        expect(chain.REFERENCE_LABEL).toBe('000643b0');
        expect(chain.USER_LABEL).toBe('000de140');
    });
});

describe('the URLs a minted item names', () => {
    test('the image is the item key in kebab case', () => {
        expect(chain.itemImageUrl('DARK_WALLS')).toBe('https://battlechoc.com/items/dark-walls.png');
    });

    test('every item has an image URL of that shape', () => {
        for (const key of Object.keys(Items)) {
            expect(chain.itemImageUrl(key)).toMatch(/^https:\/\/battlechoc\.com\/items\/[a-z-]+\.png$/);
        }
    });

    test('the item page names the user token', () => {
        const userAssetName = '000de140' + 'ab'.repeat(28);
        expect(chain.itemPageUrl(userAssetName)).toBe('https://battlechoc.com/item/?a=000de140' + 'ab'.repeat(28));
    });
});
