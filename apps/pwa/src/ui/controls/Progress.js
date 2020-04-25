import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles({
  donut: props => ({
    zIndex: 100,
    '& div': {
      height: props.size,
      width: props.size,
      marginLeft: -(props.size / 2),
      marginTop: -(props.size / 2)
    }
  }),
  invisible: {
    display: 'none'
  },
  visible: {
    display: 'block'
  }
});

const useInterval = (callback, delay) => {
  const savedCallback = useRef();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const tick = () => {
      savedCallback.current();
    }

    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

const Progress = props => {
  const classes = useStyles(props);
  const [state, setState] = useState(Math.max(0, Math.min(100, Math.floor(props.value / 10) * 10)));

  useEffect(() => {
    console.log('setState to ' + Math.max(0, Math.min(100, Math.floor(props.value / 10) * 10)))
    setState(Math.max(0, Math.min(100, Math.floor(props.value / 10) * 10)));
  }, [props.value]);

  useInterval(() => {
    setState(state > 10 ? state - 10 : 100);
  }, props.infiniteAnimation ? 200 : null);

  // It's essential to create a div for each svg to load them all in parallel
  return (
    <div className={`${classes.donut} ${props.className}`} style={props.style}>
      <div className={state === 10 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-10.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 20 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-20.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 30 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-30.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 40 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-40.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 50 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-50.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 60 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-60.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 70 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-70.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 80 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-80.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 90 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-90.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
      <div className={state === 100 ? classes.visible : classes.invisible} style={{ backgroundImage: `url(/images/progress-100.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'top left'}}></div>
    </div>
  );
};

Progress.defaultProps = {
  className: '',
  size: 64,
  style: {},
  infiniteAnimation: false,
  value: 0
}

Progress.propTypes = {
  infiniteAnimation: PropTypes.bool,
  value: PropTypes.number,
  style: PropTypes.object,
  size: PropTypes.number,
  className: PropTypes.string
}

export default Progress;
