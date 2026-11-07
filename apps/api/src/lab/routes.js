// The lab: trying ingredients on the lab table, crafting items from discovered recipes, the
// recipe book and the equipment slots (a player's items are part of their stats).

const crypto = require('crypto');
const {
    EntityType, Ingredients, Items, SpecialIngredient, SLOTS_PER_BUILDING, LOADOUT_BUDGET, sanitizeLoadout, EmptyPlayerStats,
} = require('@battlechoc/battlechoc-shared-functions');
const players = require('../players');
const pantry = require('../pantry');
const { withTransaction } = require('../db');
const { slidingWindowLimit } = require('../limits');
const { HttpError, ErrorCode } = require('../errors');

const HOUR_MS = 60 * 60 * 1000;

const registerLabRoutes = (app, { pool, user, recipes, oneAtATime, triesPerHour = 30, now = () => Date.now() }) => {
    // at most `triesPerHour` tries per player in a sliding hour
    const tries = slidingWindowLimit({ windowMs: HOUR_MS, max: triesPerHour, now });

    const discoveries = async db => {
        const { rows } = await db.query(
            'SELECT d.item_key, d.discovered_at, p.username FROM recipe_discoveries d LEFT JOIN players p ON p.id = d.player_id', []);
        return new Map(rows.map(row => [row.item_key, {
            discoveredBy: row.username || EmptyPlayerStats.username,
            discoveredAt: new Date(row.discovered_at).getTime(),
        }]));
    };

    const publicRecipe = (entry, discovery) => ({
        item: entry.item,
        entityType: entry.entityType,
        tier: entry.tier,
        fee: entry.fee,
        ingredients: entry.ingredients,
        amounts: entry.amounts,
        ...discovery,
    });

    app.post('/lab/try', ...user, async (req, res) => {
        const { entityType, ingredients } = req.body || {};
        const special = SpecialIngredient[entityType];
        if (!special || !Array.isArray(ingredients) || ingredients.length !== 2 || !ingredients.every(id => Ingredients[id])) {
            throw new HttpError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);
        }
        const tried = [special, ...ingredients];
        const owned = await pantry.totals(pool, req.playerId, now());
        if (!tried.every(id => (owned[id] || 0) > 0)) {
            throw new HttpError(400, ErrorCode.MISSING_INGREDIENTS);
        }
        if (!tries.allow(req.playerId)) {
            throw new HttpError(429, ErrorCode.TOO_MANY_TRIES);
        }
        const recipe = recipes.match(entityType, tried);
        if (!recipe) {
            const known = await discoveries(pool);
            res.json({ result: recipes.smells(entityType, tried, new Set(known.keys())) ? 'smell' : 'nothing' });
            return;
        }
        let first = false;
        const before = await discoveries(pool);
        if (!before.has(recipe.item)) {
            try {
                await pool.query('INSERT INTO recipe_discoveries (item_key, player_id, discovered_at) VALUES ($1, $2, $3)',
                    [recipe.item, req.playerId, new Date(now())]);
                first = true;
            } catch {
                // someone else discovered it in the same moment
            }
        }
        const after = await discoveries(pool);
        res.json({ result: 'found', first, recipe: publicRecipe(recipe, after.get(recipe.item)) });
    });

    app.get('/lab/recipes', ...user, async (req, res) => {
        const known = await discoveries(pool);
        const undiscovered = {};
        recipes.entries.forEach(entry => {
            if (!known.has(entry.item)) {
                undiscovered[entry.entityType] = (undiscovered[entry.entityType] || 0) + 1;
            }
        });
        res.json({
            recipes: recipes.entries.filter(entry => known.has(entry.item)).map(entry => publicRecipe(entry, known.get(entry.item))),
            undiscovered,
        });
    });

    app.post('/lab/craft', ...user, async (req, res) => {
        const { item } = req.body || {};
        const recipe = typeof item === 'string' ? recipes.get(item) : undefined;
        if (!recipe) {
            throw new HttpError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);
        }
        const crafted = await oneAtATime(req.playerId, () => withTransaction(pool, async client => {
            const { rows } = await client.query('SELECT item_key FROM recipe_discoveries WHERE item_key = $1', [recipe.item]);
            if (rows.length === 0) {
                throw new HttpError(400, ErrorCode.RECIPE_NOT_DISCOVERED);
            }
            const cost = { ...recipe.amounts };
            cost.COCOA = (cost.COCOA || 0) + recipe.fee;
            // too little in the pantry: NotEnoughIngredientsError, answered as 400
            await pantry.spend(client, req.playerId, cost, now());
            // the next serial number of this item type (the row update serializes concurrent crafts)
            const updated = await client.query('UPDATE item_serials SET last = last + 1 WHERE item_key = $1 RETURNING last', [recipe.item]);
            let serial;
            if (updated.rows.length > 0) {
                serial = Number(updated.rows[0].last);
            } else {
                await client.query('INSERT INTO item_serials (item_key, last) VALUES ($1, 1)', [recipe.item]);
                serial = 1;
            }
            const id = crypto.randomUUID();
            await client.query('INSERT INTO items (id, player_id, item_key, serial, crafted_by, created_at) VALUES ($1, $2, $3, $4, $2, $5)',
                [id, req.playerId, recipe.item, serial, new Date(now())]);
            return id;
        }));
        const items = await players.itemsOf(pool, req.playerId);
        res.json({
            item: items.find(entry => entry.id === crafted),
            pantry: await pantry.totals(pool, req.playerId, now()),
            spoiling: await pantry.spoiling(pool, req.playerId, now()),
        });
    });

    app.post('/user/equipment', ...user, async (req, res) => {
        const { entityType, slot, itemId } = req.body || {};
        if (!SpecialIngredient[entityType] || !EntityType.isInstanceOf(entityType) || !Number.isInteger(slot) ||
            slot < 0 || slot >= SLOTS_PER_BUILDING || !(itemId === null || typeof itemId === 'string')) {
            throw new HttpError(400, ErrorCode.INVALID_REQUEST_PARAMETERS);
        }
        res.json(await oneAtATime(req.playerId, () => withTransaction(pool, async client => {
            const player = await players.findPlayer(client, req.playerId);
            const items = await players.itemsOf(client, req.playerId);
            const equipment = JSON.parse(JSON.stringify(players.equipmentOf(player)));
            // points of all equipped items (stored equipment may be over the budget after a balance change)
            const pointsOf = stored => Object.values(stored).flat()
                .filter(id => id !== null)
                .reduce((sum, id) => sum + Items[items.find(entry => entry.id === id).item].points, 0);
            const pointsBefore = pointsOf(equipment);
            const slots = Array.from({ length: SLOTS_PER_BUILDING }, (_, i) => (equipment[entityType] || [])[i] || null);
            if (itemId !== null) {
                const owned = items.find(entry => entry.id === itemId);
                if (!owned) {
                    throw new HttpError(400, ErrorCode.NOT_YOUR_ITEM);
                }
                if (Items[owned.item].entityType !== entityType) {
                    throw new HttpError(400, ErrorCode.WRONG_BUILDING);
                }
                // an item is in one slot only: equipping it again moves it
                slots.forEach((id, i) => {
                    if (id === itemId) {
                        slots[i] = null;
                    }
                });
                const otherSlot = slots.find((id, i) => i !== slot && id !== null);
                const other = otherSlot && items.find(entry => entry.id === otherSlot);
                if (other && other.item === owned.item) {
                    throw new HttpError(400, ErrorCode.ALREADY_ON_THIS_BUILDING);
                }
            }
            slots[slot] = itemId;
            equipment[entityType] = slots;
            if (slots.every(id => id === null)) {
                delete equipment[entityType];
            }
            const wanted = players.loadoutOf({ equipment: { ...equipment } }, items);
            // over the budget only refuses changes that add points, so too much can be taken off step by step
            const points = pointsOf(equipment);
            if (points > LOADOUT_BUDGET && points > pointsBefore) {
                throw new HttpError(400, ErrorCode.OVER_BUDGET);
            }
            await client.query('UPDATE players SET equipment = $1 WHERE id = $2', [JSON.stringify(equipment), req.playerId]);
            return { equipment, loadout: sanitizeLoadout(wanted) };
        })));
    });
};

module.exports = { registerLabRoutes };
