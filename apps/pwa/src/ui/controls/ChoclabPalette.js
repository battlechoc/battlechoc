import React, { Component } from 'react';
import './ChoclabPalette.css';
import { EntityType } from '../../gameplay/GameEntities';
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
        }, {
            type: EntityType.CACAOTREE,
            className: 'cacaotree',
            alt: 'cacao tree preview',
        }, {
            type: EntityType.RUM_TRUFFLE_CANNON,
            className: 'cannon',
            alt: 'cannon preview',
        }, {
            type: EntityType.FACTORY_EXTENSION,
            className: 'factoryExtension',
            alt: 'factory extension preview',
        }, {
            type: EntityType.CREAM,
            className: 'cream',
            alt: 'cream preview',
        }, {
            type: EntityType.SPYING_EASTER_BUNNY,
            className: 'bunny',
            alt: 'easter factory',
        }, {
            type: EntityType.XMAS_FACTORY,
            className: 'xmasFactory',
            alt: 'xmas factory',
        }, {
            type: EntityType.CHOCOLATE_FOUNTAIN,
            className: 'fountain',
            alt: 'chocolate fountain',
        }, {
            type: EntityType.FRUIT_CANNON,
            className: 'fruitCannon',
            alt: 'fruit cannon',
        }, {
            type: EntityType.HOT_CHOCOLATE_BALLISTA,
            className: 'ballista',
            alt: 'hot chocolate ballista',
        }];
    }

    componentDidMount() {
        this.setState({ selectedEntity: EntityType.FACTORY });
        this.props.selectEntity(EntityType.FACTORY);           
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