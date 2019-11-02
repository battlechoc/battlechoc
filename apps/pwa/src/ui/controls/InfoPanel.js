import React from 'react';
import { multiplayer } from '../../Multiplayer';
import './InfoPanel.css';
import { connect } from 'react-redux';

const InfoPanel = props => {
    return (
        <div id="gameMenu">
            <div className="infoIcon">
                <div className="cacao info" style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} />
                <p>{props.game.players[multiplayer.localPlayerIndex].cacao}</p>
            </div>
            <div className="infoIcon">
                <div className="buildings info" style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} />
                <p>{props.game.players[multiplayer.localPlayerIndex].buildings + '/' + props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn}</p>
            </div>
        </div>
    );
}

const mapStateToProps = state => ({
    game: state.gameplay.game
});

const InfoPanelContainer = connect(mapStateToProps)(InfoPanel);
export default InfoPanelContainer;