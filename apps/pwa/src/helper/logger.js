class Logger {
    constructor() {
        this.infos = [];
        this.warnings = [];
        this.errors = [];
    }

    info(message) {
        this.infos.push({ time: (new Date()).getTime(), message: message });
        if (window.location.host === 'localhost:3000') {
            console.log(message);
        }
    }

    warn(message) {
        this.warnings.push({ time: (new Date()).getTime(), message: message });
        if (window.location.host === 'localhost:3000') {
            console.warn(message);
        }
    }

    error(message) {
        this.erros.push({ time: (new Date()).getTime(), message: message });
        if (window.location.host === 'localhost:3000') {
            console.error(message);
        }
    }

    summarize() {
        return {
            infos: this.infos,
            warnings: this.warnings,
            errors: this.errors
        }
    }
}

const logger = new Logger();
export default logger;