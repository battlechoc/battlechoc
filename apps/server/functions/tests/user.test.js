const request = require('supertest');
const app = require('../main').app;
const dbPool = require('../main').dbPool;
const helper = require('./helper');

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


afterAll(async () => await dbPool.end());