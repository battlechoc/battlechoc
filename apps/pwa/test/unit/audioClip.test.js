// The audio clips of the Jukebox (node --test): the music and the match sounds load only after the
// 3D models (deferred), and a song asked to play before its file arrived starts once it is there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioClip } from "../../src/ui/misc/audioClip.js";

const fakeOutput = () => {
  const started = [];
  const context = {
    currentTime: 0,
    decodeAudioData: (data, resolve) => resolve({ duration: 10, data }),
    createBufferSource: () => ({
      connect() {},
      disconnect() {},
      start(when, offset) {
        started.push({ when, offset });
      },
      stop() {},
    }),
  };
  return { output: { context }, started };
};

test("a deferred clip asks for its file only when it is told to load", async () => {
  const { output } = fakeOutput();
  let fetched = 0;
  const clip = new AudioClip(output, "/music/song.mp3", true, {
    deferred: true,
    fetchBuffer: async () => {
      fetched += 1;
      return new ArrayBuffer(8);
    },
  });
  assert.equal(fetched, 0);
  await clip.load();
  await clip.load();
  assert.equal(fetched, 1);
});

test("a song played before its file arrived starts once it is loaded", async () => {
  const { output, started } = fakeOutput();
  const clip = new AudioClip(output, "/music/song.mp3", true, {
    deferred: true,
    fetchBuffer: async () => new ArrayBuffer(8),
  });
  clip.play();
  assert.equal(started.length, 0);
  await clip.load();
  assert.equal(started.length, 1);
});

test("a song stopped before its file arrived stays silent", async () => {
  const { output, started } = fakeOutput();
  const clip = new AudioClip(output, "/music/song.mp3", true, {
    deferred: true,
    fetchBuffer: async () => new ArrayBuffer(8),
  });
  clip.play();
  clip.stop();
  await clip.load();
  assert.equal(started.length, 0);
});
