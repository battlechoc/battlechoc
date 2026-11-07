// The game's log: what a problem report carries (Settings → Submit Problem, logger.summarize()).
// Each level keeps its last LIMIT messages, so a long session does not grow it without end. The
// dev server also prints them to the console; the published game prints nothing.
const LIMIT = 500;

// import.meta.env is Vite's; under node (the unit tests) there is none
const printing = Boolean(import.meta.env && import.meta.env.DEV);

class Logger {
  constructor({ limit = LIMIT, print = printing } = {}) {
    this.limit = limit;
    this.print = print;
    this.infos = [];
    this.warnings = [];
    this.errors = [];
  }

  keep(list, message) {
    list.push({ time: new Date().getTime(), message: message });
    if (list.length > this.limit) {
      list.shift();
    }
  }

  info(...message) {
    this.keep(this.infos, message);
    if (this.print) {
      console.log(...message);
    }
  }

  warn(...message) {
    this.keep(this.warnings, message);
    if (this.print) {
      console.warn(...message);
    }
  }

  error(...message) {
    this.keep(this.errors, message);
    if (this.print) {
      console.error(...message);
    }
  }

  summarize() {
    return {
      infos: this.infos,
      warnings: this.warnings,
      errors: this.errors,
    };
  }
}

const logger = new Logger();
export default logger;
export { Logger, LIMIT };
