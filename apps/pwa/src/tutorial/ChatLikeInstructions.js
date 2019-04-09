import React, { Component } from 'react';
import PropTypes from 'prop-types';

class ChatLikeInstructions extends Component {
    constructor(props) {
        super(props);
        this.state = {
            messages: this.props.messages,
            visibleMessages: [],
            indicatorVisible: true
        }
    }

    componentDidMount() {
        this.messageDelay = setTimeout(() => this.showNextMessage(), 1000);
    }

    componentWillReceiveProps(nextProps) {
        this.setState({
            messages: nextProps.messages,
            visibleMessages: nextProps.messages.slice(0, this.state.visibleMessages.length)
        });
    }

    componentDidUpdate() {
        if (this.state.indicatorVisible) {
            this.scrollDown();
        }

        if (this.state.visibleMessages.length !== this.state.messages.length && typeof this.messageDelay === 'undefined') {
            this.showNextMessage();
        }
    }

    showNextMessage() {
        if (this.state.visibleMessages.length !== this.state.messages.length) {
            let messagesLength = this.state.visibleMessages.length;
            let delay = this.state.messages[messagesLength].delay;
            this.messageDelay = setTimeout(() => this.showNextMessage(), delay);
            this.showIndicator = setTimeout(() => this.setState({ indicatorVisible: true }) ,delay / 3);
            this.setState({indicatorVisible: false, visibleMessages: [...this.state.visibleMessages, this.state.messages[messagesLength]]});
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
        let isTyping = this.state.messages.length > this.state.visibleMessages.length;

        let typingIndicator = null;
        if (isTyping && this.state.indicatorVisible) {
            typingIndicator = <div id="typingIndicator"><span className="dot"></span><span className="dot"></span><span className="dot"></span></div>;
        }

        let speechBubbles = this.state.visibleMessages.map((message, i) => {
            if (message.type === 'text') {
                return <div key={i} className="speechBubble">{message.text}</div>;
            } else if (message.type === 'challenge') {
                return <div key={i}>{message.element}</div>;
            } else if (message.type === 'image') {
                return <div key={i} className="media"><div className="speechBubble"><img alt={message.alt} className="imageMessage" src={'images/' + message.src} /></div></div>;
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

export default ChatLikeInstructions