/**
 * ios-cenc-decryptor.js
 *
 * Software CENC AES-128-CTR decryption for iOS Safari.
 *
 * WHY THIS EXISTS:
 *   iOS Safari's CDM only supports AES-128-CBC (cbcs protection scheme).
 *   This stream uses AES-128-CTR (cenc protection scheme), which iOS cannot
 *   decrypt natively. We bypass the browser CDM entirely by:
 *     1. Stripping ContentProtection from the DASH manifest (Shaka never sets up CDM)
 *     2. Patching init segments: encv/enca → avc1/mp4a, sinf/pssh → free
 *     3. Decrypting media segment mdat content via Web Crypto AES-CTR
 *
 * CENC AES-CTR counter layout (128-bit block):
 *   [  8-byte IV (MSB)  ] [ 8-byte block counter, big-endian (starts at 0) ]
 *   Web Crypto: { name:'AES-CTR', counter: 16bytes, length: 64 }
 *   length:64 → rightmost 64 bits are the counter. Matches CENC spec exactly.
 */

// ── MP4 box primitives ────────────────────────────────────────────────────────

function r32(b, o) {
    return ((b[o] << 24) | (b[o+1] << 16) | (b[o+2] << 8) | b[o+3]) >>> 0;
}

function type4(b, o) {
    return String.fromCharCode(b[o+4], b[o+5], b[o+6], b[o+7]);
}

function setType4(b, o, t) {
    b[o+4] = t.charCodeAt(0); b[o+5] = t.charCodeAt(1);
    b[o+6] = t.charCodeAt(2); b[o+7] = t.charCodeAt(3);
}

// Walk boxes at one level, calling cb(bytes, pos, size, type) for each.
function walk(b, start, end, cb) {
    let pos = start;
    while (pos + 8 <= end) {
        const size = r32(b, pos);
        if (size < 8 || pos + size > end + 1) break;
        cb(b, pos, size, type4(b, pos));
        pos += size;
    }
}

// Find first box matching path (recursive descent).
function findBox(b, start, end, path) {
    let result = null;
    walk(b, start, end, (bytes, pos, size, t) => {
        if (result) return;
        if (t === path[0]) {
            result = path.length === 1
                ? { pos, size }
                : findBox(bytes, pos + 8, pos + size, path.slice(1));
        }
    });
    return result;
}

// ── Init segment transformation ───────────────────────────────────────────────

/**
 * Patches the init segment in-place so MSE treats it as unencrypted:
 *   • pssh  → free  (removes DRM system headers from moov)
 *   • encv  → avc1  (video sample entry: encrypted → clear)
 *   • enca  → mp4a  (audio sample entry: encrypted → clear)
 *   • sinf  → free  (scheme info box inside encv/enca)
 * All boxes keep their original size — no pointer arithmetic needed.
 */
export function transformInitSegment(data) {
    const b = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);

    const moov = findBox(b, 0, b.length, ['moov']);
    if (!moov) return b.buffer;

    // Nullify pssh boxes (DRM system init data)
    walk(b, moov.pos + 8, moov.pos + moov.size, (bytes, pos, size, t) => {
        if (t === 'pssh') setType4(bytes, pos, 'free');
    });

    // Patch every trak's sample entries
    walk(b, moov.pos + 8, moov.pos + moov.size, (bytes, pos, size, t) => {
        if (t !== 'trak') return;
        const stsd = findBox(bytes, pos + 8, pos + size, ['mdia', 'minf', 'stbl', 'stsd']);
        if (!stsd) return;

        // stsd fullbox: 4-byte header (ver+flags) + 4-byte entry_count, then entries
        walk(bytes, stsd.pos + 16, stsd.pos + stsd.size, (b2, ep, es, et) => {
            if (et === 'encv') {
                setType4(b2, ep, 'avc1');
                // encv visual fields: 6 reserved + 2 data-ref-idx + 28 visual = 36 bytes after header
                patchSinf(b2, ep + 8 + 36, ep + es);
            } else if (et === 'enca') {
                setType4(b2, ep, 'mp4a');
                // enca audio fields: 6 reserved + 2 data-ref-idx + 8+2+2+2+2+4 = 28 bytes after header
                patchSinf(b2, ep + 8 + 28, ep + es);
            }
        });
    });

    return b.buffer;
}

function patchSinf(b, start, end) {
    walk(b, start, end, (bytes, pos, size, t) => {
        if (t === 'sinf') setType4(bytes, pos, 'free');
    });
}

// ── Media segment decryption ──────────────────────────────────────────────────

const _log = (m) => { try { if (window.__iosLog) window.__iosLog(m); } catch (_) {} };

/**
 * Decrypts all encrypted samples in an fMP4 media segment.
 * Reads IV and subsample info from the senc box inside traf.
 * Uses Web Crypto AES-CTR with CENC counter layout.
 */
export async function decryptMediaSegment(data, cryptoKey) {
    const src = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
    const out = new Uint8Array(src); // copy; we overwrite encrypted regions

    let moofBox = null, mdatBox = null;
    walk(src, 0, src.length, (b, pos, size, t) => {
        if (t === 'moof') moofBox = { pos, size };
        else if (t === 'mdat') mdatBox = { pos, size };
    });
    if (!moofBox || !mdatBox) { _log('No moof/mdat in segment!'); return src.buffer; }

    const trafBox = findBox(src, moofBox.pos + 8, moofBox.pos + moofBox.size, ['traf']);
    if (!trafBox) { _log('No traf in moof!'); return src.buffer; }

    let sencBox = null, trunBox = null;
    walk(src, trafBox.pos + 8, trafBox.pos + trafBox.size, (b, pos, size, t) => {
        if (t === 'senc') sencBox = { pos, size };
        else if (t === 'trun') trunBox = { pos, size };
    });
    if (!sencBox) { _log('No senc in traf!'); return src.buffer; }

    const samples = parseSENC(src, sencBox);
    const trunSizes = trunBox ? parseTRUN(src, trunBox) : [];
    const firstIV = samples[0] ? [...samples[0].iv].map(b => b.toString(16).padStart(2, '0')).join('') : 'none';
    const hasSub = !!(samples[0]?.subsamples?.length);
    _log(`senc: ${samples.length} samples | IV0=${firstIV} | subsamples=${hasSub} | trunSizes=${trunSizes.length}`);

    const mdatStart = mdatBox.pos + 8;
    let mdatOffset = 0;
    let decryptErrors = 0;

    for (let si = 0; si < samples.length; si++) {
        const { iv, subsamples } = samples[si];

        if (subsamples && subsamples.length > 0) {
            // Subsample encryption (typical for H.264 video):
            // clear NAL header bytes are skipped; encrypted NAL body bytes are decrypted.
            // AES-CTR block counter is NOT reset between subsamples of the same sample.
            let blockCount = BigInt(0);
            let sampleByteOffset = 0;

            for (const { clearBytes, encBytes } of subsamples) {
                sampleByteOffset += clearBytes;

                if (encBytes > 0) {
                    const counter = buildCTRCounter(iv, blockCount);
                    const slice = src.slice(
                        mdatStart + mdatOffset + sampleByteOffset,
                        mdatStart + mdatOffset + sampleByteOffset + encBytes
                    );
                    try {
                        const clear = await crypto.subtle.decrypt(
                            { name: 'AES-CTR', counter, length: 64 }, cryptoKey, slice
                        );
                        out.set(new Uint8Array(clear), mdatStart + mdatOffset + sampleByteOffset);
                    } catch (e) {
                        decryptErrors++;
                        if (decryptErrors === 1) _log('AES-CTR decrypt fail: ' + e.message);
                    }
                    blockCount += BigInt(Math.ceil(encBytes / 16));
                    sampleByteOffset += encBytes;
                }
            }
            mdatOffset += sampleByteOffset;

        } else {
            // Full-sample encryption (typical for AAC audio):
            // the entire sample payload is one AES-CTR stream starting at block 0.
            const sampleSize = trunSizes[si] ?? 0;
            if (sampleSize > 0) {
                const counter = buildCTRCounter(iv, BigInt(0));
                const slice = src.slice(mdatStart + mdatOffset, mdatStart + mdatOffset + sampleSize);
                try {
                    const clear = await crypto.subtle.decrypt(
                        { name: 'AES-CTR', counter, length: 64 }, cryptoKey, slice
                    );
                    out.set(new Uint8Array(clear), mdatStart + mdatOffset);
                } catch (e) {
                    decryptErrors++;
                    if (decryptErrors === 1) _log('AES-CTR full-sample fail: ' + e.message);
                }
                mdatOffset += sampleSize;
            } else if (si === 0) {
                _log('WARN: trun sample size=0 for full-sample (audio?) si=0');
            }
        }
    }

    if (decryptErrors > 0) _log(`Total decrypt errors: ${decryptErrors}`);
    return out.buffer;
}

// ── CENC counter builder ──────────────────────────────────────────────────────

/**
 * Builds the 128-bit AES-CTR counter block for CENC:
 *   [IV (8 bytes)] [blockCount (8 bytes, big-endian)]
 *
 * Web Crypto with length:64 uses the rightmost 64 bits as the counter,
 * which maps exactly to blockCount in bytes [8..15].
 */
function buildCTRCounter(iv, blockCount) {
    const counter = new Uint8Array(16);
    counter.set(iv.slice(0, 8), 0);
    let bc = blockCount;
    for (let i = 15; i >= 8; i--) {
        counter[i] = Number(bc & BigInt(0xFF));
        bc >>= BigInt(8);
    }
    return counter;
}

// ── senc / trun parsers ───────────────────────────────────────────────────────

function parseSENC(b, box) {
    const base = box.pos + 8; // skip box header
    // fullbox: version(1) + flags(3)
    const flags = (b[base+1] << 16) | (b[base+2] << 8) | b[base+3];
    const useSubsamples = (flags & 0x2) !== 0;
    const sampleCount = r32(b, base + 4);
    const IV_SIZE = 8; // AWS MediaPackage CENC live streams always use 8-byte IVs

    let pos = base + 8;
    const samples = [];

    for (let i = 0; i < sampleCount; i++) {
        const iv = b.slice(pos, pos + IV_SIZE);
        pos += IV_SIZE;

        if (useSubsamples) {
            const count = (b[pos] << 8) | b[pos+1];
            pos += 2;
            const subsamples = [];
            for (let j = 0; j < count; j++) {
                const clearBytes = (b[pos] << 8) | b[pos+1];
                const encBytes   = r32(b, pos + 2);
                subsamples.push({ clearBytes, encBytes });
                pos += 6;
            }
            samples.push({ iv, subsamples });
        } else {
            samples.push({ iv, subsamples: null });
        }
    }
    return samples;
}

function parseTRUN(b, box) {
    const base = box.pos + 8;
    const flags = (b[base+1] << 16) | (b[base+2] << 8) | b[base+3];
    const sampleCount = r32(b, base + 4);

    let pos = base + 8;
    if (flags & 0x001) pos += 4; // data_offset
    if (flags & 0x004) pos += 4; // first_sample_flags

    const hasDuration = (flags & 0x100) !== 0;
    const hasSize     = (flags & 0x200) !== 0;
    const hasFlags    = (flags & 0x400) !== 0;
    const hasCTO      = (flags & 0x800) !== 0;

    const sizes = [];
    for (let i = 0; i < sampleCount; i++) {
        if (hasDuration) pos += 4;
        if (hasSize) { sizes.push(r32(b, pos)); pos += 4; }
        else sizes.push(0);
        if (hasFlags) pos += 4;
        if (hasCTO)   pos += 4;
    }
    return sizes;
}

// ── Public factory ────────────────────────────────────────────────────────────

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2)
        out[i >> 1] = parseInt(hex.substr(i, 2), 16);
    return out;
}

/**
 * Creates an iOS CENC decryptor for the given hex-encoded AES-128 key.
 * Returns { transformInit, decryptMedia }.
 */
export async function createIOSDecryptor(keyHex) {
    const rawKey = hexToBytes(keyHex);
    const cryptoKey = await crypto.subtle.importKey(
        'raw', rawKey, { name: 'AES-CTR' }, false, ['decrypt']
    );
    return {
        transformInit:  (data) => transformInitSegment(data),
        decryptMedia:   (data) => decryptMediaSegment(data, cryptoKey),
    };
}
