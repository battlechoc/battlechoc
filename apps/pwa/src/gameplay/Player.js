import uuidv4 from 'uuid/v4';

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AUGUSTUS_GLOOP: 'PlayerType.AUGUSTUS_GLOOP'
});

function createPlayer(name, type) {
    return { name: name, type: type, id: uuidv4() };
}

export { PlayerType, createPlayer };