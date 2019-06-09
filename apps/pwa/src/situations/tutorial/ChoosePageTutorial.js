import Situation from '../Situation';
import { GameStateTypes } from '../../gameplay/GameplayReducer';
import { PlayerType } from '../../gameplay/Player';

export default class ChoosePageTutorialSituation extends Situation {
    constructor() {
        super(3, 'Violet Beauregarde', PlayerType.VIOLET_BEAUREGARDE);
        this.game.gameplay.game.state = GameStateTypes.CHOOSE_FIELD_OR_START;
    }
    static get ui() {
        return (new ChoosePageTutorialSituation()).game.ui;
    }

    static get gameplay() {
        return (new ChoosePageTutorialSituation()).game.gameplay.game;
    }
}