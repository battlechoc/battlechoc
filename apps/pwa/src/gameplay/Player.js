import uuidv4 from 'uuid/v4';

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AUGUSTUS_GLOOP: 'PlayerType.AUGUSTUS_GLOOP'
});

function createPlayer(name, type) {
    return { 
    	name: name, 
    	type: type, 
    	id: uuidv4(),
    	cacao: 50,
    	cacaoPerTurn: 0,
    	buildings: 0,
    	buildingsPerTurn: 2,
    	attacks: 0,
    	attacksPerTurn: 0
    };
}

/*
class Augustus {
	static simulateDecision () {

	}
}
*/

export { PlayerType, createPlayer };