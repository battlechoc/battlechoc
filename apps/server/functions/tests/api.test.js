const request = require('supertest');
const uuidv4 = require('uuid/v4');
const app = require('../main').app;
const dbPool = require('../main').dbPool;
const helper = require('./helper');
const GameActionTypes = require('battlechoc-shared-functions').GameActionTypes;
const GameStateTypes = require('battlechoc-shared-functions').GameStateTypes;
const EntityType = require('battlechoc-shared-functions').EntityType;

beforeAll(async done => {
    await helper.setupDatabasePlayground();
    done();
})

it('should not be available to choose playername', async done => {
    const response = await request(app).get('/check/available/Basti');
    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    done();
});

it('should not check empty playername', async done => {
    const response = await request(app).get('/check/available/');
    expect(response.status).toBe(404);
    done();
});

it('should be available to choose playername', async done => {
    const response = await request(app).get('/check/available/BB8');
    expect(response.status).toBe(200);
    expect(response.body.available).toBe(true);
    done();
});

it('should not find Chcononymous', async done => {
    const response = await request(app).get('/user/Chocnonymous');
    expect(response.status).toBe(404);
    done();
});

it('should find Basti', async done => {
    const response = await request(app).get('/user/Basti');
    expect(response.status).toBe(200);
    expect(response.body[0].name).toBe('Basti');
    done();
});

it('should add and find a friend and then remove the friend again and find nothing', async done => {
    let response = await request(app).post('/user/friend').send({ friend: 'thebestfriendever' });
    expect(response.status).toBe(404);
    response = await request(app).post('/user/friend').send({ friend: 'Fabi' });
    expect(response.status).toBe(200);
    response = await request(app).get('/user/friends');
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
    expect(response.body[0].name).toBe('Fabi');
    response = await request(app).delete('/user/friend').send({ friend: 'thebestfriendever' });
    expect(response.status).toBe(404);
    response = await request(app).delete('/user/friend').send({ friend: 'Fabi' });
    expect(response.status).toBe(200);
    response = await request(app).get('/user/friends');
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(0);
    done();
});

it('should find a valid player', async done => {
    const response = await request(app).get('/user').send({ uid: '1337-1337-1337-1337' });
    expect(response.status).toBe(200);
    expect(response.body.stats.id).toBe('1337-1337-1337-1337');
    expect(response.body.stats.tutorialStarted).toBe(false);
    expect(response.body.stats.tutorialSkipped).toBe(false);
    expect(response.body.stats.tutorialFinished).toBe(false);
    expect(response.body.stats.username).toBe('Basti');
    expect(response.body.stats.coins).toBe(100);
    expect(response.body.stats.score).toBe(100);
    expect(response.body.stats.trackRecord.length).toBe(0);
    done();
});

it('should not find a valid player', async done => {
    const response = await request(app).get('/user').send({ uid: 'i-do-not-exist' });
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).toBe(JSON.stringify({ error: 'PLAYER NOT FOUND' }));
    done();
});

it('should update tutorial started', async done => {
    const response = await request(app).post('/user/tutorial/started').send({ uid: '1337-1337-1337-1337' });
    expect(response.status).toBe(200);
    expect(response.body.stats.tutorialStarted).toBe(true);
    expect(response.body.stats.tutorialSkipped).toBe(false);
    expect(response.body.stats.tutorialFinished).toBe(false);
    done();
});

it('should update tutorial skipped', async done => {
    const response = await request(app).post('/user/tutorial/skipped').send({ uid: '1337-1337-1337-1337' });
    expect(response.status).toBe(200);
    expect(response.body.stats.tutorialStarted).toBe(false);
    expect(response.body.stats.tutorialSkipped).toBe(true);
    expect(response.body.stats.tutorialFinished).toBe(false);
    done();
});

it('should update tutorial finished', async done => {
    const playerBeforeFinish = (await dbPool.query("SELECT * FROM players WHERE id='1337-1337-1337-1337'")).rows[0];
    const coinsBeforeFinish = playerBeforeFinish.coins;
    const scoreBeforeFinish = playerBeforeFinish.score;

    const response = await request(app).post('/user/tutorial/finished').send({ uid: '1337-1337-1337-1337' });
    expect(response.status).toBe(200);
    expect(response.body.stats.tutorialStarted).toBe(true);
    expect(response.body.stats.tutorialSkipped).toBe(false);
    expect(response.body.stats.tutorialFinished).toBe(true);
    expect(response.body.stats.coins).toBe(coinsBeforeFinish + 100);
    expect(response.body.stats.score).toBe(scoreBeforeFinish + 100);
    done();
});

it('should not allow to challenge yourself', async done => {
    const response = await request(app).post('/user/challenge').send({ opponent: 'Basti' });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toBe(JSON.stringify({ error: 'CANNOT CREATE A GAME CHALLENGING YOURSELF' }));
    done();
});

it('should challenge the player', async done => {
    const response = await request(app).post('/user/challenge').send({ opponent: 'Fabi' });
    expect(response.status).toBe(200);
    console.log(JSON.stringify(response.body));
    done();
});

it('should not find the opponent', async done => {
    const response = await request(app).post('/user/challenge').send({ opponent: 'thebestfriendever' });
    expect(response.status).toBe(404);
    done();
});

it('should not find a player', async done => {
    const response = await request(app).get('/query/user/Zee');
    expect(response.body.length).toBe(0);
    done();
});

it('should find three players', async done => {
    const response = await request(app).get('/query/user/a');
    expect(response.body.length).toBe(3);
    done();
});

it('it should find multiplayer sessions and then get a single session', async done => {
    let response = await request(app).get('/multiplayer/sessions');
    expect(response.status).toBe(200);
    expect(response.body.sessions.length).toBeGreaterThan(0);

    const multiplayerSessionId = response.body.sessions[0].id;
    response = await request(app).get(`/multiplayer/session/${multiplayerSessionId}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(multiplayerSessionId);

    response = await request(app).get(`/multiplayer/session/12345`);
    expect(response.status).toBe(404);

    done();
});

it('should choose start', async done => {
    let response = await request(app).get('/multiplayer/sessions');
    const multiplayerSessionId = response.body.sessions[0].id;
    response = await request(app).get(`/multiplayer/session/${multiplayerSessionId}`);
    expect(response.status).toBe(200);
    expect(response.body.game.state).toBe(GameStateTypes.CHOOSE_FIELD_OR_START);

    const currentPlayer = response.body.game.currentPlayerIndex;
    const issuerId = response.body.game.players[currentPlayer].id;
    const event = {
        "type": GameActionTypes.chooseStart,
        "index": 0,
        "uid": uuidv4(),
        "emitted": (new Date()).getTime(),
        "payload": {
            "issuer": issuerId
        }
    }

    response = await request(app)
        .post('/multiplayer/relay/action')
        .send({ event: event, sessionId: multiplayerSessionId, uid: issuerId });

    expect(response.status).toBe(200);
    response = await request(app).get(`/multiplayer/session/${multiplayerSessionId}`);
    expect(response.status).toBe(200);
    expect(response.body.game.state).toBe(GameStateTypes.CHOOSE_FIELD);

    done();
});

it('should choose a field', async done => {
    let response = await request(app).get('/multiplayer/sessions');
    const multiplayerSessionId = response.body.sessions[0].id;
    response = await request(app).get(`/multiplayer/session/${multiplayerSessionId}`);
    expect(response.status).toBe(200);
    expect(response.body.game.state).toBe(GameStateTypes.CHOOSE_FIELD);

    const currentPlayer = response.body.game.currentPlayerIndex;
    const issuerId = response.body.game.players[currentPlayer].id;
    const event = {
        "type": GameActionTypes.chooseField,
        "index": 0,
        "uid": uuidv4(),
        "emitted": (new Date()).getTime(),
        "payload": {
            "issuer": issuerId,
            "fieldIdx": 1
        }
    }

    response = await request(app)
        .post('/multiplayer/relay/action')
        .send({ event: event, sessionId: multiplayerSessionId, uid: issuerId });

    expect(response.status).toBe(200);
    response = await request(app).get(`/multiplayer/session/${multiplayerSessionId}`);
    expect(response.status).toBe(200);
    expect(response.body.game.state).toBe(GameStateTypes.PLAYER_1_INITIAL_PLACEMENT);

    done();
});

it('should surrender the game', async done => {
    let response = await request(app).get('/multiplayer/sessions');
    const multiplayerSessionId = response.body.sessions[0].id;

    response = await request(app).get(`/multiplayer/session/${multiplayerSessionId}`);
    expect(response.status).toBe(200);
    expect(response.body.game.isRunning).toBe(true);

    response = await request(app).post('/surrender').send({ sessionId: multiplayerSessionId });
    expect(response.status).toBe(200);

    response = await request(app).get(`/multiplayer/session/${multiplayerSessionId}`);
    expect(response.status).toBe(200);
    expect(response.body.game.isRunning).toBe(false);

    done();
});

it('should upgrade the tree', async done => {
    let player = (await dbPool.query("SELECT * FROM players WHERE name='Basti'")).rows[0];
    expect(player.level[EntityType.CACAOTREE]).toBe(0);

    let response = await request(app).post('/update/level').send({ entityType: EntityType.CACAOTREE, upgrade: true });
    expect(response.status).toBe(200);

    player = (await dbPool.query("SELECT * FROM players WHERE name='Basti'")).rows[0];
    expect(player.level[EntityType.CACAOTREE]).toBe(1);

    response = await request(app).post('/update/level').send({ entityType: EntityType.CACAOTREE, upgrade: false });
    expect(response.status).toBe(200);

    player = (await dbPool.query("SELECT * FROM players WHERE name='Basti'")).rows[0];
    expect(player.level[EntityType.CACAOTREE]).toBe(0);

    done();
});

it('should fetch the highscore', async done => {
    const response = await request(app).get('/highscore');
    expect(response.status).toBe(200);
    expect(response.body.list.length).toBe(3);
    done();
});

it('should return players rank', async done => {
    const response = await request(app).get('/rank');
    expect(response.status).toBe(200);
    expect(response.body.ranking).toBe(1);
    done();
});

it('should return random opponent', async done => {
    const response = await request(app).get('/random/opponent');
    expect(response.status).toBe(200);

    done();
});

it('should return random opponent', async done => {
    const response = await request(app).get('/user/name');
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Basti");

    done();
});

it('should create a new user', async done => {
    let response = await request(app).post('/user');
    expect(response.status).toBe(200);
    expect(response.body.stats.username).toBe('Basti');

    response = await request(app).post('/user').send({ uid: '12345-12345-12345' });
    expect(response.status).toBe(200);
    expect(response.body.stats.username).toBe('Chocnonymous');

    done();
});

it('should set a username', async done => {
    let response = await request(app).post('/user/username').send({ uid: '12345-12345-12345', username: 'Basti' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('PLAYER WITH GIVEN NAME DOES ALREADY EXIST');

    response = await request(app).post('/user/username').send({ uid: '12345-12345-12345', username: 'B?asti' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('USERNAME NOT VALID');

    response = await request(app).post('/user/username').send({ uid: '12345-12345-12345', username: 'MyNewNameIsFarTooLongLongLong' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('USERNAME NOT VALID');

    response = await request(app).post('/user/username').send({ uid: '12345-12345-12345', username: 'Paul' });
    expect(response.status).toBe(200);

    done();
});

it('should add player track record', async done => {
    const response = await request(app).post('/user/trackrecords').send({ "stats": [{ "attacks": 7, "builtEntities": 6, "espionages": 0, "moltenFields": 0, "won": true, "lost": false, "winners": [{ "idx": 0, "name": "Charlie Bucket", "level": { "EntityType.CREAM": 0, "EntityType.FACTORY": 15, "EntityType.FACTORY_EXTENSION": 8, "EntityType.CACAOTREE": 15, "EntityType.RUM_TRUFFLE_CANNON": 12, "EntityType.FRUIT_CANNON": 14, "EntityType.SPYING_EASTER_BUNNY": 11, "EntityType.XMAS_FACTORY": 8, "EntityType.HOT_CHOCOLATE_BALLISTA": 13, "EntityType.CHOCOLATE_FOUNTAIN": 15, "EntityType.DONUT_FACTORY": 5 }, "type": "PlayerType.HUMAN", "id": "cfc41eab-c394-41ef-8545-7371e9d5a40a", "cacao": 61, "cacaoPerTurn": 843, "buildings": 2, "buildingsPerTurn": 5, "donutProbability": 0, "donuts": [], "activeDonuts": [], "attacks": { "AttackType.TRUFFLE": 1, "AttackType.HOT_CHOCOLATE": 0, "AttackType.FRUIT": 0, "AttackType.BUNNY": 0 }, "attacksPerTurn": { "AttackType.TRUFFLE": 4, "AttackType.HOT_CHOCOLATE": 0, "AttackType.FRUIT": 0, "AttackType.BUNNY": 0 }, "hasFactory": true, "statistics": { "attacks": 7, "builtEntities": 6, "espionages": 0, "moltenFields": 0 }, "fieldIndex": 0 }], "id": "1f908d03-50e1-4f3d-bc97-ef5de2fed722" }] });
    expect(response.status).toBe(200);
    expect(response.body.stats.winnings).toBe("1");

    done();
});

it('should fail to add player track record', async done => {
    const response = await request(app).post('/user/trackrecords').send({});
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toBe(JSON.stringify({ error: 'INVALID REQUEST PARAMETERS' }));
    done();
});


it('should change users language', async done => {
    let response = await request(app).post('/user/language').send({ uid: '12345-12345-12345', language: 'de' });
    expect(response.status).toBe(200);
    expect(response.body.language).toBe('de');

    done();
});

it('should not change to invalid language', async done => {
    let response = await request(app).post('/user/language').send({ uid: '12345-12345-12345', language: 'kf' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID LANGUAGE GIVEN');

    done();
});

afterAll(async () => await dbPool.end());