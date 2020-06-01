import React, { Component } from 'react';
import { Progress } from './ui/controls';
import { connect } from 'react-redux';
import { assetsReady } from './ui/UiActions';
import { EntityType, BoardCellTypes } from 'battlechoc-shared-functions';
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
                [EntityType.DONUT_FACTORY]: 'donutFactory.glb',
                [EntityType.DONUT_PORTAL_RED]: 'donutPortalRed.glb',
                [EntityType.DONUT_PORTAL_BLUE]: 'donutPortalBlue.glb',
                [EntityType.DONUT_SURPRISE_YELLOW]: 'donutSurpriseYellow.glb',
                [EntityType.DONUT_STOP_PINK]: 'donutStopPink.glb',
                [EntityType.DONUT_CREAM_WHITE]: 'donutCreamWhite.glb',
                [EntityType.DONUT_HEALTH_GREEN]: 'donutHealthGreen.glb'
            },
            images: [
                'add-icon.svg',
                'dialog-border-left.svg',
                'info-icon.svg',
                'raindrop.png',
                'apple-share-icon.svg',
                'dialog-border-right.svg',
                'info.svg',
                'refresh.svg',
                'arrow-down.svg',
                'dialog-border-top.svg',
                'instagram.svg',
                ' score.svg',
                'attacksPerTurn.png',
                'done.svg',
                'search.svg',
                'back.svg',
                'donut-factory-icon.svg',
                'lab.svg',
                'secondary-close.svg',
                'backward-accent.svg',
                'donut_icon_palette.png',
                'level-up-icon.svg',
                'send.svg',
                'backward.svg',
                'donuts-disabled.svg',
                'level.svg',
                'settings.svg',
                'ballista-icon.svg',
                'donuts-enabled.svg',
                'lock.svg',
                'share.svg',
                'battlechoc_notification_icon.png',
                'dropdown.svg',
                'logo.svg',
                'spyAttacksPerTurn.png',
                'buildings-icon.svg',
                'easter-bunny-icon.svg',
                'lost.svg',
                'stop-donut-icon.svg',
                'buildingsPerTurn.png',
                'error-icon.svg',
                'mute.svg',
                'stripes.svg',
                'bunnyCaught.png',
                'facebook.svg',
                'pen.svg',
                'success-icon.svg',
                'cacao-icon.svg',
                'factory-extension-icon.svg',
                'phone-rotation.svg',
                'surprise-donut-icon.svg',
                'cacao-tree-icon.svg',
                'factory-icon.svg',
                'portal-donut-icon.svg',
                'cacao.svg',
                'fast-backward.svg',
                'primary-close.svg',
                'cacaoPerTurn.png',
                'fast-forward.svg',
                'progress-10.svg',
                'trophy.svg',
                'cacao_no_background.png',
                'first-turn.svg',
                'progress-100.svg',
                'truffle-cannon-icon.svg',
                'choclab-decoration-left.svg',
                'forward.svg',
                'progress-20.svg',
                'user.svg',
                'choclab-decoration-right.svg',
                'fountain-icon.svg',
                'progress-30.svg',
                'volume.svg',
                'close.svg',
                'fruit-cannon-icon.svg',
                'progress-40.svg',
                'warning-close.svg',
                'coins.svg',
                'fullscreen.svg',
                'progress-50.svg',
                'warning-icon.svg',
                'cream-donut-icon.svg',
                'gears.svg',
                'progress-60.svg',
                'win.svg',
                'cream-icon.svg',
                'header.svg',
                'progress-70.svg',
                'xmas-factory-icon.svg',
                'cream.svg',
                'health-donut-icon.svg',
                'progress-80.svg',
                'decoration.svg',
                'highscore.svg',
                'progress-90.svg',
                'bell.svg',
                '../animations/loading.gif'
            ]
        }
    }    
}

const assetLoader = new AssetLoader();

class AssetLoadingView extends Component {
    constructor(props) {
        super(props);
        this.state = { loadingProgress: 0 }
    }

    componentDidMount() {
        this.props.onRef(this);
        this.totalResources = Object.keys(assetLoader.assets.models).length + assetLoader.assets.images.length;
        this.loadedResources = 0;
    }

    loadAssets(scene) {
        for (let key in assetLoader.assets.models) {
            SceneLoader.ImportMesh('', '/models/', assetLoader.assets.models[key], scene, group => {
                group.forEach((mesh, i) => {
                    if (Object.values(BoardCellTypes).includes(key) && mesh.name !== '__root__') {
                        let material = new StandardMaterial(key + '.material', scene);
                        if (key === BoardCellTypes.BROWN) {
                            material.diffuseColor = Color3.FromHexString("#824529");
                        } else if (key === BoardCellTypes.BLACK) {
                            material.diffuseColor = Color3.FromHexString("#3E211B");
                        } else {
                            material.diffuseColor = Color3.FromHexString("#F8DBAF");
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
                            shieldMaterial.diffuseColor = Color3.FromHexString("#DE8731");
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

        for (const image of assetLoader.assets.images) {
            this.loadImage('/images/' + image).then(() => this.updateProgress());
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
            xhr.open('GET', src);
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                new Image().src = src;
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
        return <Progress className="assetLoader" value={this.state.loadingProgress} />
    }
}

const mapStateToProps = state => ({ game: state.gameplay.game });
const mapDispatchToProps = { assetsReady };
const AssetLoadingViewContainer = connect(
    mapStateToProps, 
    mapDispatchToProps
)(AssetLoadingView);
export { assetLoader, AssetLoadingViewContainer };