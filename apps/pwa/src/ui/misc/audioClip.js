// A sound or a song of the Jukebox: the decoded file played through `output` (a GainNode). The
// music and the match sounds are `deferred`: they load only when told (Jukebox.loadDeferred, once
// the 3D models are in), so they do not take the connection away from the first start. A song
// asked to play before its file arrived starts as soon as it is there.

const fetchArrayBuffer = (url) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("get", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.response)
        : reject({ status: xhr.status, statusText: xhr.statusText });
    xhr.onerror = () =>
      reject({ status: xhr.status, statusText: xhr.statusText });
    xhr.send();
  });

export class AudioClip {
  constructor(
    output,
    url,
    loop,
    { deferred = false, fetchBuffer = fetchArrayBuffer } = {}
  ) {
    this.output = output;
    this.context = output.context;
    this.url = url;
    this.loop = loop;
    this.offset = 0;
    this.fetchBuffer = fetchBuffer;
    this.loading = null;
    // a song asked to play while its file is still on the way
    this.wanted = false;
    if (!deferred) {
      this.load().catch((error) =>
        console.warn("Audio was unable to load: ", error)
      );
    }
  }

  /** Loads the file once; resolves when it can play. */
  load() {
    if (this.loading === null) {
      this.loading = this.fetchBuffer(this.url)
        .then(
          (data) =>
            new Promise((resolve, reject) =>
              this.context.decodeAudioData(data, resolve, reject)
            )
        )
        .then((buffer) => {
          this.buffer = buffer;
          if (this.wanted) {
            this.wanted = false;
            this.play();
          }
        });
    }
    return this.loading;
  }

  play() {
    if (typeof this.buffer === "undefined") {
      this.wanted = this.loop;
      return;
    }
    if (this.loop) {
      if (typeof this.source !== "undefined") {
        try {
          this.source.stop();
        } catch (error) {
          console.info(error);
        }
      }
      this.source = this.context.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.connect(this.output);
      this.source.loop = true;
      this.source.start(
        this.context.currentTime,
        this.offset % Math.floor(this.buffer.duration)
      );
    } else {
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.connect(this.output);
      source.onended = () => source.disconnect();
      source.start();
    }
  }

  stop(reset = false) {
    this.wanted = false;
    if (typeof this.source !== "undefined") {
      if (this.loop && !reset) {
        this.offset = this.context.currentTime;
      } else if (this.loop && reset) {
        this.offset = 0;
      }
      try {
        this.source.stop();
      } catch (error) {
        console.info(error);
      }
    }
  }
}
