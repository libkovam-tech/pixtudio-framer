import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, EncodedPacketSink,
  Conversion, Output, BufferTarget, StreamTarget, Mp4OutputFormat, WebMOutputFormat } from 'mediabunny';
import { webmSourceFrames, findWebmSourceFrame } from './webm-lazy-timing.mjs';

const VERSION = '1.65.2';
const MAX_AUDIO_COPY_BYTES = 64 * 1024 * 1024; // Diagnostic memory guard, not a V1 product limit.

function fail(message) { throw new Error(message); }
function fingerprint(sample) {
  const canvas = document.createElement('canvas');
  canvas.width = sample.displayWidth;
  canvas.height = sample.displayHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  sample.draw(ctx, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;
  for (const value of data) hash = Math.imul(hash ^ value, 16777619) >>> 0;
  canvas.width = canvas.height = 0;
  return hash.toString(16).padStart(8, '0');
}
async function packetSummary(track) {
  let count = 0, firstPtsUs = null, lastEndUs = null, hash = 2166136261;
  const packets = [];
  for await (const packet of new EncodedPacketSink(track).packets()) {
    const ptsUs = packet.microsecondTimestamp;
    const durationUs = packet.microsecondDuration;
    if (firstPtsUs === null) firstPtsUs = ptsUs;
    lastEndUs = Math.max(lastEndUs ?? -Infinity, ptsUs + durationUs);
    for (const byte of packet.data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    packets.push([ptsUs, durationUs]);
    count++;
  }
  return { count, firstPtsUs, lastEndUs, hash: hash.toString(16), packets };
}

export async function runDiagnostic(file, signal = new AbortController().signal, hooks = {}) {
  const result = { schema: 1, backend: `mediabunny ${VERSION} + WebCodecs`,
    browser: navigator.userAgent,
    environment: { os: navigator.userAgentData?.platform ?? navigator.platform,
      browserBrands: navigator.userAgentData?.brands ?? null },
    file: { name: file.name, bytes: file.size },
    status: 'FAIL', checks: {}, warnings: [] };
  const source = new BlobSource(file, { maxCacheSize: 8 * 1024 * 1024 });
  let bytesRead = 0;
  source.on('read', ({ start, end }) => { bytesRead += end - start; });
  const input = new Input({ formats: ALL_FORMATS, source });
  const checkAbort = () => { if (signal.aborted) fail('Diagnostic cancelled'); };
  let active = 0, peakActive = 0;
  const sourceTimingStats = { bytesRead: 0, maxBufferBytes: 0 };
  try {
    if (!globalThis.VideoDecoder) fail('WebCodecs VideoDecoder unavailable');
    checkAbort();
    if (!await input.canRead()) fail('Container not recognized');
    const videoTracks = await input.getVideoTracks();
    const audioTracks = await input.getAudioTracks();
    if (videoTracks.length !== 1) fail(`Expected one video track; found ${videoTracks.length}`);
    const track = videoTracks[0];
    const [format, codec, config, codedWidth, codedHeight, displayWidth, displayHeight,
      rotation, par, duration] = await Promise.all([
      input.getFormat(), track.getCodec(), track.getDecoderConfig(), track.getCodedWidth(),
      track.getCodedHeight(), track.getDisplayWidth(), track.getDisplayHeight(),
      track.getRotation(), track.getPixelAspectRatio(), input.getDurationFromMetadata(),
    ]);
    result.metadata = { container: format.name, codec, codedWidth, codedHeight,
      displayWidth, displayHeight, rotation, par, duration, audioTracks: audioTracks.length,
      audioCodecs: await Promise.all(audioTracks.map(row => row.getCodec())) };
    result.checks.demux = 'PASS';
    if (par.num !== par.den) fail('PAR != 1: V1 rejects this source');
    result.checks.par = 'PASS';
    if (!config) fail('No WebCodecs decoder config');
    const support = await VideoDecoder.isConfigSupported(config);
    result.checks.decoderSupport = support.supported ? 'PASS' : 'FAIL';
    if (!support.supported) fail('VideoDecoder does not support this file codec/profile');

    let sourceTiming = null;
    if (format.name === 'WebM') {
      checkAbort();
      sourceTiming = webmSourceFrames(file, signal, sourceTimingStats)[Symbol.asyncIterator]();
    }

    const sink = new VideoSampleSink(track);
    const firstPts = await track.getFirstTimestamp();
    const end = duration ?? await input.computeDuration();
    const sequential = [];
    const sampleLimit = hooks.fullSequence ? Infinity : end - firstPts <= 2 ? 10000 : 16;
    for await (const sample of sink.samples()) {
      active++; peakActive = Math.max(active, peakActive);
      try {
        checkAbort();
        if (sample.displayWidth !== displayWidth || sample.displayHeight !== displayHeight ||
          sample.rotation !== rotation) {
          result.checks.geometry = 'FAIL';
          fail(`Display geometry or rotation changed at frame ${sequential.length}`);
        }
        const sourceFrame = sourceTiming ? (await sourceTiming.next()).value : null;
        if (sourceTiming && (!sourceFrame || Math.abs(sourceFrame.ptsNs / 1000 - sample.microsecondTimestamp) > 1))
          fail(`WebM source/decode PTS mismatch at frame ${sequential.length}`);
        if (sourceTiming && sourceFrame?.durationNs == null)
          fail(`WebM source duration unknown at frame ${sequential.length}`);
        sequential.push({ index: sequential.length, ptsUs: sample.microsecondTimestamp,
          durationUs: sourceFrame ? Math.round(sourceFrame.durationNs / 1000) : sample.microsecondDuration,
          ...(sourceFrame && { sourcePtsNs: sourceFrame.ptsNs, sourceDurationNs: sourceFrame.durationNs,
            durationSource: sourceFrame.durationSource, backendDurationUs: sample.microsecondDuration }),
          width: sample.displayWidth,
          height: sample.displayHeight, rotation: sample.rotation,
          pixelHash: fingerprint(sample) });
      } finally { sample.close(); active--; }
      hooks.onFrame?.(sequential.length);
      if (sequential.length >= sampleLimit) break;
    }
    if (!sequential.length) fail('Decoder produced no frames');
    result.checks.firstFrames = 'PASS';
    result.checks.release = active === 0 && peakActive <= 1 ? 'PASS' : 'FAIL';
    result.checks.presentationOrder = sequential.every((row, i) => i === 0 || row.ptsUs >= sequential[i - 1].ptsUs) ? 'PASS' : 'FAIL';
    result.checks.geometry = sequential.every(row => row.width === displayWidth && row.height === displayHeight && row.rotation === rotation) ? 'PASS' : 'FAIL';
    result.frames = sequential;
    if (sourceTiming) {
      if (sequential.length < sampleLimit && !(await sourceTiming.next()).done)
        fail('WebM source contains more frames than decoder');
      result.checks.sourceTiming = sequential.length < sampleLimit
        ? 'PASS' : 'PARTIAL: sampled frames only';
      result.metadata.sourceTiming = { defaultDurationNs: sourceTimingStats.defaultDurationNs,
        timestampScaleNs: sourceTimingStats.timestampScaleNs, clusters: sourceTimingStats.clusters,
        metadataRead: 'lazy Blob.slice' };
    }
    result.metadata.frameCount = sampleLimit === 10000 && sequential.length < sampleLimit
      ? sequential.length : null;

    const targets = [firstPts, (firstPts + end) / 2, Math.max(firstPts, end - 0.000001)];
    const sparse = [];
    for (const target of targets) {
      checkAbort();
      const sample = await sink.getSample(target);
      if (!sample) { sparse.push(null); continue; }
      try {
        const sourceFrame = sourceTiming ? await findWebmSourceFrame(file, sample.microsecondTimestamp, signal, sourceTimingStats) : null;
        if (sourceTiming && !sourceFrame) fail(`WebM seek PTS absent from source at ${sample.microsecondTimestamp}`);
        if (sourceTiming && sourceFrame.durationNs == null) fail(`WebM seek duration unknown at ${sample.microsecondTimestamp}`);
        sparse.push({ requested: target, ptsUs: sample.microsecondTimestamp,
          durationUs: sourceFrame ? Math.round(sourceFrame.durationNs / 1000) : sample.microsecondDuration,
          ...(sourceFrame && { sourceDurationNs: sourceFrame.durationNs,
            durationSource: sourceFrame.durationSource, backendDurationUs: sample.microsecondDuration }),
          pixelHash: fingerprint(sample) });
      }
      finally { sample.close(); }
    }
    result.samples = sparse;
    result.checks.middle = sparse[1] ? 'PASS' : 'FAIL';
    result.checks.last = sparse[2] ? 'PASS' : 'FAIL';
    const same = sequential.find(row => row.ptsUs === sparse[1]?.ptsUs);
    result.checks.referenceIdentity = same ? same.pixelHash === sparse[1].pixelHash ? 'PASS' : 'FAIL' : 'NOT PROVEN: middle outside first 16';
    const deltas = sequential.slice(1).map((row, i) => row.ptsUs - sequential[i].ptsUs);
    result.checks.timing = deltas.every(delta => delta > 0) ? 'PARTIAL: sampled PTS monotonic; no independent oracle' : 'FAIL';
    // More than 10 μs excludes 1 μs integer rounding of otherwise constant rational frame rates.
    result.metadata.cfrVfrSample = deltas.length && Math.max(...deltas) - Math.min(...deltas) > 10
      ? 'VFR observed' : 'CFR or undetermined';

    if (!audioTracks.length) result.checks.audio = 'NOT APPLICABLE';
    else {
      let opfsDirectory = null, opfsHandle = null, opfsWritable = null, opfsName = null;
      if (file.size > MAX_AUDIO_COPY_BYTES) {
        if (!navigator.storage?.getDirectory) fail('OPFS unavailable for streaming large-file audio copy');
        opfsDirectory = await navigator.storage.getDirectory();
        opfsName = `pixtudio-v01-audio-${crypto.randomUUID()}`;
        opfsHandle = await opfsDirectory.getFileHandle(opfsName, { create: true });
        opfsWritable = await opfsHandle.createWritable();
      }
      const target = opfsWritable ? new StreamTarget(opfsWritable) : new BufferTarget();
      try {
      const sourceAudioCodecs = await Promise.all(audioTracks.map(row => row.getCodec()));
      const audioCodec = await audioTracks[0].getCodec();
      const audioFormat = audioCodec === 'opus' ? new WebMOutputFormat() : new Mp4OutputFormat();
      const output = new Output({ format: audioFormat, target });
      const conversion = await Conversion.init({ input, output, video: { discard: true },
        trim: { start: 0 }, copy: { mode: 'forced', shiftTolerance: 0 } });
      if (!conversion.isValid || conversion.discardedTracks.some(row => audioTracks.includes(row.track)) ||
        conversion.utilizedTracks.length !== audioTracks.length) {
        result.checks.audio = 'FAIL: cannot copy all audio tracks';
      } else {
        checkAbort();
        signal.addEventListener('abort', () => { void conversion.cancel(); }, { once: true });
        hooks.onAudioStart?.();
        await conversion.execute();
        const audioBlob = opfsHandle ? await opfsHandle.getFile() :
          new Blob([target.buffer], { type: audioCodec === 'opus' ? 'audio/webm' : 'audio/mp4' });
        const reread = new Input({ formats: ALL_FORMATS, source: new BlobSource(audioBlob) });
        try {
          const copied = await reread.getAudioTracks();
          const before = await Promise.all(audioTracks.map(packetSummary));
          const after = await Promise.all(copied.map(packetSummary));
          let firstPacketMismatch = null;
          for (let i = 0; i < Math.min(before.length, after.length) && !firstPacketMismatch; i++) {
            for (let j = 0; j < Math.min(before[i].packets.length, after[i].packets.length); j++) {
              const original = before[i].packets[j], copiedPacket = after[i].packets[j];
              if (Math.abs(original[0] - copiedPacket[0]) > 1 ||
                Math.abs(original[1] - copiedPacket[1]) > 1) {
                firstPacketMismatch = { track: i, packet: j, original, copied: copiedPacket };
                break;
              }
            }
          }
          const packetParity = before.length === after.length && before.every((row, i) =>
            row.count === after[i].count && row.hash === after[i].hash &&
            row.packets.every((packet, j) => Math.abs(packet[0] - after[i].packets[j][0]) <= 1 &&
              Math.abs(packet[1] - after[i].packets[j][1]) <= 1));
          result.audio = { codec: audioCodec, bytes: audioBlob.size, tracks: copied.length,
            storage: opfsHandle ? 'OPFS StreamTarget' : 'BufferTarget',
            copiedCodecs: await Promise.all(copied.map(row => row.getCodec())),
            before: before.map(({ packets, ...row }) => row), after: after.map(({ packets, ...row }) => row),
            packetParity, firstPacketMismatch };
          result.checks.audio = copied.length === audioTracks.length &&
            result.audio.copiedCodecs.every((value, i) => value === sourceAudioCodecs[i]) &&
            packetParity ? 'PASS' : 'FAIL';
        } finally { reread.dispose(); }
      }
      } finally {
        if (opfsWritable && opfsWritable.locked === false) {
          try { await opfsWritable.abort(); } catch { /* Already closed after successful conversion. */ }
        }
        if (opfsDirectory && opfsName) await opfsDirectory.removeEntry(opfsName);
      }
    }
    result.status = Object.values(result.checks).some(value => String(value).startsWith('FAIL')) ? 'FAIL' :
      Object.values(result.checks).some(value => String(value).startsWith('NOT PROVEN') ||
        String(value).startsWith('NOT TESTED') || String(value).startsWith('PARTIAL'))
        ? 'PASS WITH LIMITATIONS' : 'PASS';
  } catch (error) {
    result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    result.status = signal.aborted ? 'CANCELLED' : 'FAIL';
  } finally {
    input.dispose();
    result.resources = { bytesRead, sourceTimingBytesRead: sourceTimingStats.bytesRead,
      sourceTimingMaxBufferBytes: sourceTimingStats.maxBufferBytes,
      sourceBytes: file.size, activeSamplesAtExit: active,
      peakLeasedSamples: peakActive };
  }
  return result;
}

let lastResult = null;
let controller = null;
const fileEl = document.querySelector('#file');
const resultEl = document.querySelector('#result');
const summaryEl = document.querySelector('#summary');
function showSummary(result) {
  const m = result.metadata ?? {};
  const c = result.checks ?? {};
  const rows = [
    ['Result', result.status], ['File', result.file?.name], ['Container', m.container],
    ['Video codec', m.codec], ['Audio codec', m.audioCodecs?.join(', ') || 'none'],
    ['Resolution', m.codedWidth && m.codedHeight ? `${m.codedWidth} × ${m.codedHeight}` : null],
    ['Display resolution', m.displayWidth && m.displayHeight ? `${m.displayWidth} × ${m.displayHeight}` : null],
    ['Rotation', m.rotation], ['PAR', m.par ? `${m.par.num}:${m.par.den}` : null],
    ['Duration', m.duration], ['Frame count', m.frameCount ?? 'unknown (sampled)'],
    ['CFR/VFR', m.cfrVfrSample], ['WebCodecs support', c.decoderSupport],
    ['Demux', c.demux], ['Decode first frames', c.firstFrames], ['Decode middle', c.middle],
    ['Decode last', c.last], ['Timing', c.timing], ['Reference snap', c.referenceIdentity],
    ['Audio preservation', c.audio], ['Error', result.error],
  ];
  summaryEl.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value == null ? 'unknown' : String(value);
    summaryEl.append(dt, dd);
  }
}
document.querySelector('#run').onclick = async () => {
  const file = fileEl.files?.[0];
  if (!file) { resultEl.textContent = 'Choose a video file first.'; return; }
  controller = new AbortController();
  resultEl.textContent = 'Running diagnostic…';
  lastResult = await runDiagnostic(file, controller.signal);
  showSummary(lastResult);
  resultEl.textContent = JSON.stringify(lastResult, null, 2);
  document.querySelector('#save').disabled = false;
};
document.querySelector('#cancel').onclick = () => controller?.abort();
document.querySelector('#save').onclick = () => {
  if (!lastResult) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'PIXTUDIO_BATCH_VIDEO_DEVICE_DIAGNOSTIC.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
window.runDiagnostic = runDiagnostic;
window.compareOrientation = async (file, expectedUrl) => {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = (await input.getVideoTracks())[0];
    const sample = await new VideoSampleSink(track).getSample(await track.getFirstTimestamp());
    if (!sample) throw new Error('No first sample');
    const canvas = document.createElement('canvas');
    canvas.width = sample.displayWidth; canvas.height = sample.displayHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    try { sample.draw(ctx, 0, 0, canvas.width, canvas.height); }
    finally { sample.close(); }
    const observed = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const expectedImage = new Image(); expectedImage.src = expectedUrl; await expectedImage.decode();
    const expectedCanvas = document.createElement('canvas');
    expectedCanvas.width = expectedImage.naturalWidth; expectedCanvas.height = expectedImage.naturalHeight;
    const expectedCtx = expectedCanvas.getContext('2d', { willReadFrequently: true });
    expectedCtx.drawImage(expectedImage, 0, 0);
    const expected = expectedCtx.getImageData(0, 0, canvas.width, canvas.height).data;
    const width = canvas.width, height = canvas.height;
    const score = (map) => {
      let sum = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const [xx, yy] = map(x, y);
        const i = 4 * (y * width + x), j = 4 * (yy * width + xx);
        for (let c = 0; c < 3; c++) sum += Math.abs(observed[i + c] - expected[j + c]);
      }
      return sum / (width * height * 3);
    };
    return { observedSize: [width, height], expectedSize: [expectedImage.naturalWidth, expectedImage.naturalHeight],
      mae: { identity: score((x, y) => [x, y]), rotate180: score((x, y) => [width - 1 - x, height - 1 - y]),
        flipH: score((x, y) => [width - 1 - x, y]), flipV: score((x, y) => [x, height - 1 - y]) } };
  } finally { input.dispose(); }
};
window.probeLazy = async (file) => {
  const source = new BlobSource(file, { maxCacheSize: 8 * 1024 * 1024 });
  let bytesRead = 0, samples = 0;
  source.on('read', ({ start, end }) => { bytesRead += end - start; });
  const input = new Input({ formats: ALL_FORMATS, source });
  try {
    const track = (await input.getVideoTracks())[0];
    for await (const sample of new VideoSampleSink(track).samples()) {
      try { samples++; } finally { sample.close(); }
      if (samples === 3) break;
    }
    return { sourceBytes: file.size, bytesRead, samples };
  } finally { input.dispose(); }
};
window.probeFullSequence = async (file, requestedTargets = null) => {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file, { maxCacheSize: 8 * 1024 * 1024 }) });
  try {
    const track = (await input.getVideoTracks())[0];
    if (!track) fail('No video track');
    const first = await track.getFirstTimestamp();
    const end = await input.computeDuration();
    const targets = requestedTargets ?? [first, (first + end) / 2, Math.max(first, end - 0.000001)];
    const references = [];
    const seekSink = new VideoSampleSink(track);
    for (const target of targets) {
      const sample = await seekSink.getSample(target);
      if (!sample) fail(`No seek sample at ${target}`);
      try { references.push({ requested: target, ptsUs: sample.microsecondTimestamp,
        durationUs: sample.microsecondDuration, pixelHash: fingerprint(sample) }); }
      finally { sample.close(); }
    }
    const wanted = new Set(references.map(row => row.ptsUs));
    const frames = [], matching = [];
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        const ptsUs = sample.microsecondTimestamp;
        frames.push({ ptsUs, durationUs: sample.microsecondDuration,
          width: sample.displayWidth, height: sample.displayHeight, rotation: sample.rotation });
        if (wanted.has(ptsUs)) matching.push({ ptsUs, pixelHash: fingerprint(sample) });
      } finally { sample.close(); }
    }
    return { references, matching, frames };
  } finally { input.dispose(); }
};
