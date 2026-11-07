// Bounded-memory EBML timing reader for the isolated research stand.
// It reads headers with Blob.slice() and skips encoded payloads by offset.
const ID = { SEGMENT: 0x18538067, INFO: 0x1549a966, SCALE: 0x2ad7b1,
  TRACKS: 0x1654ae6b, TRACK: 0xae, NUMBER: 0xd7, TYPE: 0x83,
  DEFAULT: 0x23e383, TRACK_SCALE: 0x23314f, CLUSTER: 0x1f43b675,
  TIME: 0xe7, SIMPLE: 0xa3, GROUP: 0xa0, BLOCK: 0xa1, DURATION: 0x9b };
const PAGE = 4096;

class Reader {
  constructor(blob, signal, stats) {
    this.blob = blob; this.signal = signal; this.stats = stats;
    this.start = -1; this.cache = new Uint8Array();
  }
  async byte(position) {
    if (this.signal?.aborted) throw new Error('Diagnostic cancelled');
    if (!Number.isSafeInteger(position) || position < 0 || position >= this.blob.size)
      throw new Error(`EBML read outside file at ${position}`);
    if (position < this.start || position >= this.start + this.cache.length) {
      this.start = position;
      this.cache = new Uint8Array(await this.blob.slice(position, Math.min(this.blob.size, position + PAGE)).arrayBuffer());
      this.stats.bytesRead += this.cache.length;
      this.stats.maxBufferBytes = Math.max(this.stats.maxBufferBytes, this.cache.length);
      if (this.signal?.aborted) throw new Error('Diagnostic cancelled');
    }
    return this.cache[position - this.start];
  }
  async vint(position, id = false) {
    const first = await this.byte(position);
    if (!first) throw new Error(`Invalid EBML VINT at ${position}`);
    let width = 1;
    while (width <= 8 && !(first & (0x80 >> (width - 1)))) width++;
    if (width > 8) throw new Error(`Invalid EBML VINT width at ${position}`);
    let value = BigInt(id ? first : first & ((1 << (8 - width)) - 1));
    for (let i = 1; i < width; i++) value = (value << 8n) | BigInt(await this.byte(position + i));
    const unknown = !id && value === (1n << BigInt(7 * width)) - 1n;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('EBML value exceeds safe integer range');
    return { value: Number(value), width, unknown };
  }
  async element(position, limit) {
    const id = await this.vint(position, true);
    const size = await this.vint(position + id.width);
    const data = position + id.width + size.width;
    const end = size.unknown ? limit : data + size.value;
    if (end > limit || end <= position || !Number.isSafeInteger(end))
      throw new Error(`Invalid EBML element at ${position}`);
    return { id: id.value, data, end, unknown: size.unknown, offset: position };
  }
  async *children(start, end) {
    for (let pos = start; pos < end;) {
      const e = await this.element(pos, end);
      yield e;
      pos = e.end;
    }
  }
  async uint(e) {
    if (e.end - e.data > 8) throw new Error('EBML integer too wide');
    let value = 0n;
    for (let pos = e.data; pos < e.end; pos++) value = (value << 8n) | BigInt(await this.byte(pos));
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('EBML integer exceeds safe range');
    return Number(value);
  }
  async float(e) {
    const size = e.end - e.data;
    if (size !== 4 && size !== 8) throw new Error('Invalid EBML float');
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) data[i] = await this.byte(e.data + i);
    const view = new DataView(data.buffer);
    return size === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
  }
  async block(e, clusterTime, videoNumber, explicit = null) {
    const track = await this.vint(e.data);
    if (track.value !== videoNumber) return null;
    const p = e.data + track.width;
    if (p + 3 > e.end) throw new Error('Short video block');
    const relative = (await this.byte(p) << 8) | await this.byte(p + 1);
    const signed = relative & 0x8000 ? relative - 0x10000 : relative;
    if ((await this.byte(p + 2)) & 0x06) throw new Error('Laced video block unsupported');
    return { ptsTicks: clusterTime + signed, explicitDurationTicks: explicit, offset: e.offset };
  }
}

async function* rawVideoBlocks(reader, stats) {
  let scaleNs = 1000000, video = null;
  let segment = null;
  for await (const e of reader.children(0, reader.blob.size)) {
    if (e.id === ID.SEGMENT) { segment = e; break; }
  }
  if (!segment) throw new Error('WebM has no Segment');
  for await (const top of reader.children(segment.data, segment.end)) {
    if (top.id === ID.INFO) {
      for await (const e of reader.children(top.data, top.end))
        if (e.id === ID.SCALE) scaleNs = await reader.uint(e);
    } else if (top.id === ID.TRACKS) {
      for await (const entry of reader.children(top.data, top.end)) {
        if (entry.id !== ID.TRACK) continue;
        const t = { number: null, type: null, defaultDurationNs: null, trackScale: 1 };
        for await (const e of reader.children(entry.data, entry.end)) {
          if (e.id === ID.NUMBER) t.number = await reader.uint(e);
          if (e.id === ID.TYPE) t.type = await reader.uint(e);
          if (e.id === ID.DEFAULT) t.defaultDurationNs = await reader.uint(e);
          if (e.id === ID.TRACK_SCALE) t.trackScale = await reader.float(e);
        }
        if (t.type === 1) {
          if (video) throw new Error('Multiple WebM video tracks unsupported');
          video = t;
        }
      }
    } else if (top.id === ID.CLUSTER) {
      stats.clusters = (stats.clusters ?? 0) + 1;
      if (top.unknown) throw new Error('Unknown-size WebM Cluster unsupported');
      if (!video || !Number.isFinite(video.trackScale) || video.trackScale <= 0)
        throw new Error('WebM video TrackEntry missing before Cluster');
      stats.defaultDurationNs = video.defaultDurationNs;
      stats.timestampScaleNs = scaleNs;
      let clusterTime = null;
      for await (const e of reader.children(top.data, top.end)) {
        if (e.id === ID.TIME) clusterTime = await reader.uint(e);
        if (e.id !== ID.SIMPLE && e.id !== ID.GROUP) continue;
        if (clusterTime === null) throw new Error('Cluster block precedes Timestamp');
        let frame;
        if (e.id === ID.SIMPLE) frame = await reader.block(e, clusterTime, video.number);
        else {
          let block = null, duration = null;
          for await (const part of reader.children(e.data, e.end)) {
            if (part.id === ID.BLOCK) block = part;
            if (part.id === ID.DURATION) duration = await reader.uint(part);
          }
          if (!block) throw new Error('BlockGroup has no Block');
          frame = await reader.block(block, clusterTime, video.number, duration);
        }
        if (frame) yield { ...frame, tickNs: scaleNs * video.trackScale,
          defaultDurationNs: video.defaultDurationNs };
      }
    }
  }
}

export async function* webmSourceFrames(blob, signal, stats = { bytesRead: 0, maxBufferBytes: 0 }) {
  const reader = new Reader(blob, signal, stats);
  let pending = null, index = 0;
  for await (const current of rawVideoBlocks(reader, stats)) {
    if (pending) {
      if (current.ptsTicks <= pending.ptsTicks) throw new Error('Non-monotonic WebM video PTS');
      yield resolved(pending, current, index++);
    }
    pending = current;
  }
  if (!pending) throw new Error('WebM contains no video blocks');
  yield resolved(pending, null, index);
}

function resolved(block, next, index) {
  const durationSource = block.explicitDurationTicks !== null ? 'BlockDuration'
    : block.defaultDurationNs !== null ? 'DefaultDuration' : next ? 'next PTS' : 'unknown';
  const durationNs = block.explicitDurationTicks !== null ? block.explicitDurationTicks * block.tickNs
    : block.defaultDurationNs !== null ? block.defaultDurationNs
      : next ? (next.ptsTicks - block.ptsTicks) * block.tickNs : null;
  return { index, ptsNs: block.ptsTicks * block.tickNs, durationNs, durationSource };
}

export async function findWebmSourceFrame(blob, ptsUs, signal, stats) {
  for await (const frame of webmSourceFrames(blob, signal, stats)) {
    const observed = Math.round(frame.ptsNs / 1000);
    if (observed === ptsUs) return frame;
    if (observed > ptsUs) break;
  }
  return null;
}
