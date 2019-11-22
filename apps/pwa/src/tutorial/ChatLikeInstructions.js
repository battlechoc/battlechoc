import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Translation as t } from '../ui/misc';
import { IconButton } from '@material-ui/core';
import { ArrowForwardIos as ArrowForwardIcon} from '@material-ui/icons';

class ChatLikeInstructions extends Component {
    constructor(props) {
        super(props);
        this.state = {
            visibleMessages: [],
            indicatorVisible: true
        }
    }

    componentDidMount() {
        this.messageDelay = setTimeout(() => this.showNextMessage(), 1000);
    }

    componentDidUpdate() {
        if (this.state.indicatorVisible) {
            this.scrollDown();
        }

        if (this.state.visibleMessages.length !== this.props.messages.length && typeof this.messageDelay === 'undefined') {
            this.showNextMessage();
        }
    }

    showNextMessage() {
        if (this.state.visibleMessages.length !== this.props.messages.length) {
            let messagesLength = this.state.visibleMessages.length;
            let delay = this.props.messages[messagesLength].delay;
            this.messageDelay = setTimeout(() => this.showNextMessage(), delay);
            this.showIndicator = setTimeout(() => this.setState({ indicatorVisible: true }) ,delay / 3);
            this.setState({indicatorVisible: false, visibleMessages: [...this.state.visibleMessages, this.props.messages[messagesLength]]});
            this.scrollDown();
        } else {
            this.messageDelay = undefined;
            this.showIndicator = undefined;
        }
    }

    scrollDown() {
        let speechBubbles = document.getElementsByClassName('speechBubbles')[0];
        if (typeof speechBubbles === 'object') {
            speechBubbles.scrollTop = speechBubbles.scrollHeight;
        }      
    }

    componentWillUnmount() {
        if (this.messageDelay) {
            clearTimeout(this.messageDelay);
        }
        if (this.showIndicator) {
            clearTimeout(this.showIndicator);
        }
    };

    render() {
        let isTyping = this.props.messages.length > this.state.visibleMessages.length;

        let typingIndicator = null;
        if (isTyping && this.state.indicatorVisible) {
            typingIndicator = <div id="typingIndicator"><span className="dot"></span><span className="dot"></span><span className="dot"></span></div>;
        }
        let speechBubbles = this.state.visibleMessages.map((message, i) => {
            if (message.type === 'text') {
                return <div key={i} className="speechBubble">{ t[this.props.language][message.text]}</div>;
            } else if (message.type === 'challenge') {
                return <div key={i}>{message.element}</div>;
            } else if (message.type === 'image') {
                if (['factory', 'cacaotree', 'cannon', 'fruitCannon'].includes(message.src)) {
                    return <div key={i} className="media"><div className="speechBubble"><div className={message.src + ' preview'} style={{ backgroundImage: 'url(/images/toolbar_icon_palette.png)' }}></div></div></div>;
                } else if (message.src === 'skip') {
                    return <div key={i} className="media"><div className="speechBubble"><IconButton color="inherit" aria-label="next"><ArrowForwardIcon /></IconButton></div></div>;
                } else {
                    return <div key={i} className="media"><div className="speechBubble"><img alt={message.alt} src={message.src} /></div></div>;
                }
            } else {
                return null;
            }
        });
        return (
            <div>
                { this.props.appbar }
                <div className="speechBubbles">   
                    { speechBubbles }
                    { typingIndicator }
                </div>
            </div>
        );
    }
}

ChatLikeInstructions.propTypes = {
    messages: PropTypes.array.isRequired,
    appbar: PropTypes.element.isRequired
}

const mapStateToProps = state => ({ language: state.ui.language });
const ChatLikeInstructionsContainer = connect(mapStateToProps)(ChatLikeInstructions);
export default ChatLikeInstructionsContainer;