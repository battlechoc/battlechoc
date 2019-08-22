import React, { Component } from 'react';
import './ChoclabPalette.css';
import { EntityType, getEntityDescriptor } from '../../gameplay/GameEntities';
import { Jukebox } from '../misc';

class ChoclabPalette extends Component {
	constructor(props) {
		super(props);
		this.state = { selectedEntity: EntityType.FACTORY };
	}

    componentWillMount() {
        this.buildingsForSeclection = [{
            type: EntityType.FACTORY,
            className: 'factory',
            alt: 'factory preview',
            costs: getEntityDescriptor(EntityType.FACTORY).costs
        }, {
            type: EntityType.CACAOTREE,
            className: 'cacaotree',
            alt: 'cacao tree preview',
            costs: getEntityDescriptor(EntityType.CACAOTREE).costs
        }, {
            type: EntityType.RUM_TRUFFLE_CANNON,
            className: 'cannon',
            alt: 'cannon preview',
            costs: getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON).costs
        }, {
            type: EntityType.FACTORY_EXTENSION,
            className: 'factoryExtension',
            alt: 'factory extension preview',
            costs: getEntityDescriptor(EntityType.FACTORY_EXTENSION).costs
        }, {
            type: EntityType.CREAM,
            className: 'cream',
            alt: 'cream preview',
            costs: getEntityDescriptor(EntityType.CREAM).costs
        }, {
            type: EntityType.SPYING_EASTER_BUNNY,
            className: 'bunny',
            alt: 'easter factory',
            costs: getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY).costs
        }, {
            type: EntityType.XMAS_FACTORY,
            className: 'xmasFactory',
            alt: 'xmas factory',
            costs: getEntityDescriptor(EntityType.XMAS_FACTORY).costs
        }, {
            type: EntityType.CHOCOLATE_FOUNTAIN,
            className: 'fountain',
            alt: 'chocolate fountain',
            costs: getEntityDescriptor(EntityType.CHOCOLATE_FOUNTAIN).costs
        }, {
            type: EntityType.FRUIT_CANNON,
            className: 'fruitCannon',
            alt: 'fruit cannon',
            costs: getEntityDescriptor(EntityType.FRUIT_CANNON).costs
        }, {
            type: EntityType.HOT_CHOCOLATE_BALLISTA,
            className: 'ballista',
            alt: 'hot chocolate ballista',
            costs: getEntityDescriptor(EntityType.HOT_CHOCOLATE_BALLISTA).costs
        }];
    }

    selectEntity(buildingType) {
    	this.setState({ selectedEntity: buildingType });
        this.props.selectEntity(buildingType);      
    }

    render() {
        return (
            <div id="entitySelection">
                {(() => this.buildingsForSeclection.map((building, i) => {
                        let className = this.state.selectedEntity === building.type ? 'selected previewContainer' : 'canbuild previewContainer';
                        return <div className={className} key={i}>
                            <div className={building.className + ' enabled preview'} 
                                 style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    this.selectEntity(building.type);
                            }} />
                        </div>
                    })
                )()}
            </div>
        );
    }
}

export default ChoclabPalette;