import React, { Component } from 'react';
import { multiplayer } from '../Multiplayer';
import './InfoPanel.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

class InfoPanel extends Component {
    render() {
        if (this.props.isVisible) {
            return (
                <div id="gameMenu">
                    <div className="infoIcon">
                        <div className="cacao info" style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} />
                        <p>{this.props.game.players[multiplayer.localPlayerIndex].cacao}</p>
                    </div>
                    <div className="infoIcon">
                        <div className="buildings info" style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} />
                        <p>{this.props.game.players[multiplayer.localPlayerIndex].buildings + '/' + this.props.game.players[multiplayer.localPlayerIndex].buildingsPerTurn}</p>
                    </div>
                </div>
            );
        } else {
            return null;
        }
    }
}

InfoPanel.propTypes = {
    isVisible: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game
});

const InfoPanelContainer = connect(
    mapStateToProps
)(InfoPanel);

export default InfoPanelContainer;