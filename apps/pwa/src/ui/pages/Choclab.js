import React, { Component } from 'react';
import './Choclab.css';
import OfflineStore from '../../OfflineStore';
import { updatePlayerStats, updateLevel } from '../UiActions';
import { Translation as t } from '../misc';
import { connect } from 'react-redux';
import { getEntityDescriptor } from '../../gameplay/GameEntities';
import { AddBox, Undo } from '@material-ui/icons';
import { ChoclabPalette } from '../controls';
import MeshPreview from '../../3d/MeshPreview';
import IconButton from '@material-ui/core/IconButton';
import Snackbar from '@material-ui/core/Snackbar';
import { ServerRequest } from '../../helper/settings';
import logger from '../../helper/logger';

class Choclab extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedEntity: null
        }
    }

    render() {
        return (
            <div id="choclab">
                {typeof this.props.playerInfos.stats.coins !== 'undefined' ? <div id="coins">
                    <span>{ this.props.playerInfos.stats.coins }</span>
                    <img src="/images/coins.png" alt="choco coins" />
                </div> : null}
                <MeshPreview onRef={meshPreview => this.meshPreview = meshPreview}/>

                <Snackbar
                    anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                    open={this.state.upgradeMessageOpen}
                    onClose={() => this.setState({upgradeMessageOpen: false})}
                    autoHideDuration={10000}
                    ContentProps={{'aria-describedby': 'message-id'}}
                    message={typeof this.state.upgrade !== 'undefined' ? <span id="message-id">{`${t[this.props.language].ATTRIBUTE_NAME(this.state.upgrade.attribute)} ${t[this.props.language].CHOCLAB_INCREASED_BY} ${this.state.upgrade.value}!`}</span> : null}
                    action={
                      <IconButton
                        aria-label="close"
                        color="inherit"
                        onClick={async () => {
                            ServerRequest('post', '/undo/upgrade', {
                                entity: this.state.selectedEntityType,
                                attribute: this.state.upgrade.attribute,
                                actionId: this.state.upgradeAction
                            })
                            .then(response => {
                                this.props.updateLevel(response.data.level).then(() => {
                                    this.props.updatePlayerStats({ 'coins': response.data.coins });
                                    OfflineStore.playerStore.get('stats').then(playerStats => {
                                        playerStats.coins = response.data.coins;
                                        OfflineStore.playerStore.set('stats', playerStats);
                                    });
                                    this.setState({ 
                                        "selectedEntity": getEntityDescriptor(this.state.selectedEntityType, this.props.level),
                                        "upgradeMessageOpen": false,
                                        "upgrade": undefined,
                                        "upgradeAction": undefined
                                    })
                                })
                            }).catch(error => logger.warn(error));
                        }}
                      >
                        <Undo />
                      </IconButton>
                    }
                />

                <div className="entityStats">
                    { this.state.selectedEntity ? this.state.selectedEntity.style.map(attribute => {
                        let values = this.state.selectedEntity[attribute.name]();
                        let percentage = (values[0] / values[1]) * 100;
                        let classNames = 'progress';
                        if (['fortune', 'area', 'buildingsPerTurn'].includes(attribute.name)) {
                            classNames += ' locked';
                        }
                        return (
                            <div className={classNames} key={attribute.name}>
                                <div className="label"><span>{ t[this.props.language].ATTRIBUTE_NAME(attribute.name) }</span><span>{ Math.round(values[0]) }</span></div>
                                <div>
                                    <div className={attribute.color} style={{ width: percentage + '%'}}></div>
                                    { classNames === 'progress' && values[0] < values[1] && this.props.playerInfos.stats.coins >= this.state.selectedEntity.coins() ?
                                    <AddBox onClick={() => {                                        
                                        ServerRequest('post', '/upgrade/entity', {
                                            entity: this.state.selectedEntityType,
                                            attribute: attribute.name 
                                        })
                                        .then(response => {
                                            this.props.updateLevel(response.data.level).then(() => {
                                                this.props.updatePlayerStats({ 'coins': response.data.coins });
                                                OfflineStore.playerStore.get('stats').then(playerStats => {
                                                    playerStats.coins = response.data.coins;
                                                    OfflineStore.playerStore.set('stats', playerStats);
                                                });
                                                this.setState({ 
                                                    "selectedEntity": getEntityDescriptor(this.state.selectedEntityType, this.props.level),
                                                    "upgradeMessageOpen": true,
                                                    "upgradeAction": response.data.last_upgrade_action,
                                                    "upgrade": {
                                                        "attribute": attribute.name,
                                                        "value": values[0],
                                                        "costs": this.state.selectedEntity.coins(),
                                                        "entity": this.state.selectedEntityType
                                                    }
                                                })
                                            });
                                        }).catch(error => logger.warn(error));
                                    }} /> : null }
                                </div>
                            </div>
                        )
                    })  : null }
                    { this.state.selectedEntity ? (
                        <div className="coin costs">
                            <span>{ this.state.selectedEntity.coins() }</span>
                            <img src="/images/coins.png" alt="choco coins" />
                        </div>) : null }
                </div>
                <ChoclabPalette selectEntity={entity => {
                    this.setState({ selectedEntity: getEntityDescriptor(entity, this.props.level) });
                    this.setState({ selectedEntityType: entity });
                    this.meshPreview.loadMesh(entity);
                }} />
            </div>
        );
    }
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language,
    level: state.ui.playerInfos.stats.level,
    playerInfos: state.ui.playerInfos
});

const mapDispatchToProps = {
    updateLevel,
    updatePlayerStats
};

const ChoclabContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Choclab);

export default ChoclabContainer;