import React, { useState } from 'react';
import { EntityType } from '../../gameplay/GameEntities';
import { Jukebox } from '../misc';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
    palette: {
        width: '50vw',
        maxWidth: 400,
        position: 'absolute',
        bottom: 0,
        display: 'flex',
        flexWrap: 'wrap',
        '@media screen and (max-width: 600px) and (orientation: portrait)': {
            flexDirection: 'column',
            bottom: 5,
            width: 'unset',
            maxWidth: 'unset',
            flexWrap: 'unset'
        }
    },
    preview: {
        width: 'calc(10vw - 5px)',
        height: 'calc(10vw - 5px)',
        marginTop: 2,
        backgroundSize: 'calc(4 * (10vw - 5px)) calc(3 * (10vw - 5px))',
        '@media screen and (min-width: 800px)': { 
            width: 75,
            height: 75,
            backgroundSize: '300px 225px'
        },
        '@media screen and (max-width: 600px) and (orientation: portrait)': {
            width: 'calc(7.3vh - 5px)',
            height: 'calc(7.3vh - 5px)',
            backgroundSize: 'calc(4 * (7.3vh - 5px)) calc(3 * (7.3vh - 5px))'
        }
    }
}));


const ChoclabPalette = props => {
    const classes = useStyles();
    const [selectedEntity, setSelectedEntity] = useState(EntityType.FACTORY);
 
    let buildingsForSeclection = [{
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

    let selectEntity = buildingType => {
        setSelectedEntity(buildingType);
        props.selectEntity(buildingType);      
    }

    return (
        <div className={classes.palette}>
            {(() => buildingsForSeclection.map((building, i) => {
                    let className = selectedEntity === building.type ? 'selected previewContainer' : 'canbuild previewContainer';
                    return <div className={className} key={i}>
                        <div className={`${building.className} enabled preview ${classes.preview}`} 
                             style={{ backgroundImage: 'url(/images/toolbar_icon_palette.png)' }} onClick={() => {
                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                selectEntity(building.type);
                        }} />
                    </div>
                })
            )()}
        </div>
    );
}

export default ChoclabPalette;