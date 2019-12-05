import React from 'react';

const features = { isWebPSupported: document.getElementById('root').classList.contains('webp-support') };

const OptimizedImage = props => {
    let {src, alt, ...attributes} = props;
    if (features.isWebPSupported) {
        src = src.replace(/(.*)\.(jpg|png)+(\?v=.*)*$/, '$1.webp$3');
    }
    return <img src={src} alt={alt} {...attributes}></img>
}

export { features, OptimizedImage };

