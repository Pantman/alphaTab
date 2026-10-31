// SPDX-License-Identifier: MPL-2.0
import { ByteBuffer } from '@coderline/alphatab/io/ByteBuffer';
import { ZipReader } from '@coderline/alphatab/zip/ZipReader';
import { Crc32 } from '@coderline/alphatab/zip/Crc32';
import { ScoreImportError } from './types';

export const importLimits = Object.freeze({ inputBytes: 32 * 1024 * 1024, entryBytes: 16 * 1024 * 1024,
    expandedBytes: 64 * 1024 * 1024, entries: 256, notes: 200000 });

/** Validate ZIP sizes and topology BEFORE alphaTab allocates expanded entries. No files are extracted. */
export function readGpif(bytes: Uint8Array): string {
    const fail = (message: string): never => { throw new ScoreImportError('invalid-archive', message); };
    if (!bytes.length || bytes.length > importLimits.inputBytes) {
        throw new ScoreImportError('input-size', 'The score must be between 1 byte and 32 MB.');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) {
        throw new ScoreImportError('unsupported-format', 'This version imports modern Guitar Pro .gp archives only.');
    }
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
    }
    if (end < 0) fail('Missing ZIP directory.');
    const count = view.getUint16(end + 10, true);
    const start = view.getUint32(end + 16, true);
    const size = view.getUint32(end + 12, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) ||
        view.getUint16(end + 8, true) !== count || !count || count > importLimits.entries || start + size !== end) {
        fail('Split, ZIP64 or oversized ZIP directories are not supported.');
    }
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const names = new Set<string>();
    const checksums = new Map<string, { size: number; crc: number }>();
    const records: Array<{ offset: number; end: number }> = [];
    let cursor = start;
    let total = 0;
    for (let i = 0; i < count; i++) {
        if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) fail('Invalid ZIP entry.');
        const flags = view.getUint16(cursor + 8, true);
        const method = view.getUint16(cursor + 10, true);
        const compressed = view.getUint32(cursor + 20, true);
        const expanded = view.getUint32(cursor + 24, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const offset = view.getUint32(cursor + 42, true);
        const recordEnd = cursor + 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
        if (recordEnd > end || offset + 30 > start || expanded > importLimits.entryBytes || (flags & ~0x808) ||
            (method !== 0 && method !== 8) || view.getUint16(cursor + 34, true)) fail('Unsupported or oversized ZIP entry.');
        const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
        if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') ||
            name.split('/').includes('..') || names.has(name)) fail('Unsafe or duplicate ZIP path.');
        names.add(name);
        checksums.set(name, { size: expanded, crc: view.getUint32(cursor + 16, true) });
        if (view.getUint32(offset, true) !== 0x04034b50 || view.getUint16(offset + 6, true) !== flags ||
            view.getUint16(offset + 8, true) !== method || view.getUint16(offset + 26, true) !== nameLength) fail('ZIP headers disagree.');
        const localName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
        if (localName !== name) fail('ZIP names disagree.');
        const dataStart = offset + 30 + nameLength + view.getUint16(offset + 28, true);
        let dataEnd = dataStart + compressed;
        if (dataEnd > start) fail('ZIP data extends beyond its directory.');
        if (flags & 8) {
            if (dataEnd + 12 > start) fail('Truncated ZIP descriptor.');
            if (view.getUint32(dataEnd, true) === 0x08074b50) dataEnd += 4;
            if (dataEnd + 12 > start) fail('Truncated ZIP descriptor.');
            if (view.getUint32(dataEnd, true) !== view.getUint32(cursor + 16, true)) fail('ZIP descriptor checksum disagrees.');
            const firstSize = view.getUint32(dataEnd + 4, true);
            const secondSize = view.getUint32(dataEnd + 8, true);
            // Guitar Pro writes these two descriptor sizes in reverse ZIP-spec order.
            // Accept either order, but only when both match the bounded central sizes.
            if (!((firstSize === compressed && secondSize === expanded) ||
                (firstSize === expanded && secondSize === compressed))) fail('ZIP descriptor sizes disagree.');
            // alphaTab's reader also uses the local expanded size for allocation.
            const localExpanded = view.getUint32(offset + 22, true);
            if (localExpanded !== 0 && localExpanded !== expanded) fail('ZIP local size disagrees.');
            dataEnd += 12;
        } else if (view.getUint32(offset + 14, true) !== view.getUint32(cursor + 16, true) ||
            view.getUint32(offset + 18, true) !== compressed || view.getUint32(offset + 22, true) !== expanded) {
            fail('ZIP local sizes disagree.');
        }
        records.push({ offset, end: dataEnd });
        total += expanded;
        if (total > importLimits.expandedBytes) fail('Expanded score exceeds the 64 MB limit.');
        cursor = recordEnd;
    }
    if (cursor !== end || !names.has('Content/score.gpif')) fail('Missing Guitar Pro score.');
    records.sort((a, b) => a.offset - b.offset);
    let expected = 0;
    for (const record of records) { if (record.offset !== expected) fail('Overlapping or unlisted ZIP data.'); expected = record.end; }
    if (expected !== start) fail('Unlisted ZIP data.');
    const entries = new ZipReader(ByteBuffer.fromBuffer(bytes), importLimits.entryBytes).read();
    if (entries.length !== count) fail('ZIP entry count disagrees.');
    for (const entry of entries) {
        const expected = checksums.get(entry.fullName);
        const crc = new Crc32();
        crc.update(entry.data, 0, entry.data.length);
        if (!expected || entry.data.length !== expected.size || (crc.value >>> 0) !== expected.crc) fail('ZIP checksum or expanded size disagrees.');
    }
    const gpif = entries.find(entry => entry.fullName === 'Content/score.gpif');
    if (!gpif) fail('Missing Guitar Pro score.');
    const xml = decoder.decode(gpif!.data);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('External declarations are not accepted.');
    if ((xml.match(/<Note[\s>]/g) ?? []).length > importLimits.notes) fail('Too many source notes.');
    return xml;
}
