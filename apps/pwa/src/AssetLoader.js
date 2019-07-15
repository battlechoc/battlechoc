import React, { Component } from 'react';
import CircularProgress from '@material-ui/core/CircularProgress';
import { connect } from 'react-redux';
import { assetsReady } from './ui/UiActions';
import { EntityType, BoardCellTypes } from './gameplay/GameEntities';
import { SceneLoader, StandardMaterial, Color3, Engine } from 'babylonjs';
import 'babylonjs-loaders';

class AssetLoader {
    constructor(){
        this.assets = {
            models: {
                [BoardCellTypes.WHITE]: 'field.glb',
                [BoardCellTypes.BROWN]: 'field.glb',
                [BoardCellTypes.BLACK]: 'field.glb',
                [EntityType.FACTORY]: 'factory.glb',
                [EntityType.FACTORY_EXTENSION]: 'factoryExtension.glb',
                [EntityType.CACAOTREE]: 'cacaotree.glb',
                [EntityType.RUM_TRUFFLE_CANNON]: 'cannon.glb',
                [EntityType.CREAM]: 'cream.glb',
                [EntityType.CREAM + '.AROUND.BUILDING']: 'creamAroundBuilding.glb',
                [EntityType.SPYING_EASTER_BUNNY]: 'spyingEasterBunny.glb',
                [EntityType.XMAS_FACTORY]: 'xmasFactory.glb',
                [EntityType.HOT_CHOCOLATE_BALLISTA]: 'hotChocolateBallista.glb',
                [EntityType.CHOCOLATE_FOUNTAIN]: 'chocolateFountain.glb',
                [EntityType.FRUIT_CANNON]: 'fruitCannon.glb',
            },
            images: {
                CACAO_NO_BACKGROUND: 'cacao_no_background.png',
                CACAO_PER_TURN: 'cacaoPerTurn.png',
                TOOLBAR_ICON_PALETTE: 'toolbar_icon_palette.png',
                ATTACKS_PER_TUN: 'attacksPerTurn.png',
                CREAM_PREVIEW: 'cream_preview.png',
                BUILDINGS_PER_TURN: 'buildingsPerTurn.png',
                SPY_ATTACKS_PER_TURN: 'spyAttacksPerTurn.png',
                BUNNY_CAUGHT: 'bunnyCaught.png',
                LOADING: '../animations/loading.gif'
            }
        }
    }    
}

const assetLoader = new AssetLoader();
class AssetLoadingView extends Component {
    constructor(props) {
        super(props);
        this.assetVersion = '8.0';
        this.state = { loadingProgress: 0 }
    }

    componentDidMount() {
        this.props.onRef(this);
        this.totalResources = Object.keys(assetLoader.assets.models).length + Object.keys(assetLoader.assets.images).length;
        this.loadedResources = 0;
    }

    loadAssets(scene) {
        for (let key in assetLoader.assets.models) {
            SceneLoader.ImportMesh('', 'models/', assetLoader.assets.models[key] + '?v=' + this.assetVersion, scene, group => {
                group.forEach((mesh, i) => {
                    if (Object.values(BoardCellTypes).includes(key) && mesh.name !== '__root__') {
                        let material = new StandardMaterial(key + '.material', scene);
                        if (key === BoardCellTypes.BROWN) {
                            material.diffuseColor﻿ = Color3.FromHexString("#824529");
                        } else if (key === BoardCellTypes.BLACK) {
                            material.diffuseColor﻿ = Color3.FromHexString("#3E211B");
                        } else {
                            material.diffuseColor﻿ = Color3.FromHexString("#F8DBAF");
                        }
                        mesh.material = material;
                    }
                    mesh.name = key + (mesh.name === '__root__' ? '__root__' : i);
                    if (mesh.material) {
                        mesh.material.sideOrientation = 1;
                    }
                    mesh.setEnabled(false);
                    if (key === EntityType.CHOCOLATE_FOUNTAIN && mesh.material !== null) {
                        if (mesh.material.name === 'Shield') {
                            let shieldMaterial = new StandardMaterial(key + '.Shield.material', scene);
                            shieldMaterial.diffuseColor﻿ = Color3.FromHexString("#DE8731");
                            shieldMaterial.alpha = 0.5;
                            shieldMaterial.alphaMode = Engine.ALPHA_COMBINE;
                            mesh.material = shieldMaterial;
                            mesh.visibility = 0.6;
                        }
                    }
                });
                this.updateProgress();
            });
        }

        for (let i = 0; i < Object.keys(assetLoader.assets.images).length; i++) {
            this.loadImage('images/' + assetLoader.assets.images[Object.keys(assetLoader.assets.images)[i]]).then(() => this.updateProgress());
        }                     
    }

    updateProgress() {
        this.loadedResources += 1;
        if (this.loadedResources === this.totalResources) {
            this.props.assetsReady();
        } else {
            this.setState({ loadingProgress: Math.round((this.loadedResources / (this.totalResources - 1)) * 100) });
        }
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', src + '?v=' + this.assetVersion);
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
              } else {
                reject({ status: xhr.status, statusText: xhr.statusText });
              }
            };
            
            xhr.onerror = () => reject({ status: xhr.status, statusText: xhr.statusText });
            xhr.send();
        });
    }

    render() {
        return <CircularProgress className="assetLoader" variant="static" value={this.state.loadingProgress} />
    }
}

const mapStateToProps = state => ({ game: state.gameplay.game });
const mapDispatchToProps = { assetsReady };
const AssetLoadingViewContainer = connect(
    mapStateToProps, 
    mapDispatchToProps
)(AssetLoadingView);
export { assetLoader, AssetLoadingViewContainer };