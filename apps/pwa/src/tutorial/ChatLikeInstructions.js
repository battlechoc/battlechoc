import React, { Component } from 'react';
import PropTypes from 'prop-types';

class ChatLikeInstructions extends Component {
    constructor(props) {
        super(props);
        this.state = {
            messages: this.props.messages,
            visibleMessages: []
        }
    }

    componentDidMount() {
        this.messageDelay = setTimeout(() => this.showNextMessage(), 1000);
    }

    showNextMessage() {
        if (this.state.visibleMessages.length !== this.state.messages.length) {
            let messagesLength = this.state.visibleMessages.length;
            this.messageDelay = setTimeout(() => this.showNextMessage(), this.state.messages[messagesLength].delay);
            this.setState({visibleMessages: [...this.state.visibleMessages, this.state.messages[messagesLength]]});
            let speechBubbles = document.getElementsByClassName('speechBubbles')[0];
            speechBubbles.scrollTop = speechBubbles.scrollHeight;
        }
    }

    componentWillUnmount() {
        if (this.messageDelay) {
            clearTimeout(this.messageDelay);
        }
    };

    render() {
        let speechBubbles = this.state.visibleMessages.map((message, i) => {
            if (message.type === 'text') {
                return <div key={i} className="speechBubble">{message.text}</div>;
            } else if (message.type === 'challenge') {
                return <div key={i}>{message.element}</div>;
            } else {
                return null;
            }
        });
        return (
            <div className="speechBubbles">   
                { speechBubbles }
            </div>
        );
    }
}

ChatLikeInstructions.propTypes = {
    messages: PropTypes.array.isRequired
}

export default ChatLikeInstructions