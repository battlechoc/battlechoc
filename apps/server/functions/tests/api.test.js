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
    let response = await request(app).post('/user/friend').send({friend: 'thebestfriendever'});
    expect(response.status).toBe(404);
    response = await request(app).post('/user/friend').send({friend: 'Fabi'});
    expect(response.status).toBe(200);
    response = await request(app).get('/user/friends');
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
    expect(response.body[0].name).toBe('Fabi');
    response = await request(app).delete('/user/friend').send({friend: 'thebestfriendever'});
    expect(response.status).toBe(404);
    response = await request(app).delete('/user/friend').send({friend: 'Fabi'});
    expect(response.status).toBe(200);
    response = await request(app).get('/user/friends');
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(0);
    done();
});

it('should not allow to challenge yourself', async done => {
    const response = await request(app).post('/user/challenge').send({opponent: 'Basti'});
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toBe(JSON.stringify({ error: 'CANNOT CREATE A GAME CHALLENGING YOURSELF' }));
    done();
});

it('should challenge the player', async done => {
    const response = await request(app).post('/user/challenge').send({opponent: 'Fabi'});
    expect(response.status).toBe(200);
    done();
});

it('should not find the opponent', async done => {
    const response = await request(app).post('/user/challenge').send({opponent: 'thebestfriendever'});
    expect(response.status).toBe(404);
    done();
});

it('should not find a player', async done => {    
    const response = await request(app).get('/query/user/Zee');
    expect(response.body.length).toBe(0);
    done();
});

it('should not find both players', async done => {    
    const response = await request(app).get('/query/user/a');
    expect(response.body.length).toBe(2);
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

afterAll(async () => await dbPool.end());