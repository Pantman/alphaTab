// SPDX-License-Identifier: MPL-2.0
import { MusicFontSymbol as Symbol } from '@coderline/alphatab/model/MusicFontSymbol';

/** MusicXML shapes and explicit fill, independent of duration and MIDI identity. */
export function percussionNotehead(symbol: Symbol): { value: string; filled?: boolean } | undefined {
    switch (symbol) {
        case Symbol.NoteheadBlack: return { value: 'normal', filled: true };
        case Symbol.NoteheadHalf:
        case Symbol.NoteheadWhole:
        case Symbol.NoteheadDoubleWhole:
        case Symbol.NoteheadDoubleWholeSquare: return { value: 'normal', filled: false };
        case Symbol.NoteheadNull: return { value: 'none' };
        // MusicXML's X semantics also cover heavy/ornate source glyph variants.
        case Symbol.NoteheadHeavyX:
        case Symbol.NoteheadHeavyXHat:
        case Symbol.NoteheadXOrnate:
        case Symbol.NoteheadXBlack:
        case Symbol.NoteheadXHalf:
        case Symbol.NoteheadXWhole:
        case Symbol.NoteheadXDoubleWhole: return { value: 'x' };
        case Symbol.NoteheadCircleX:
        case Symbol.NoteheadCircleXHalf:
        case Symbol.NoteheadCircleXWhole:
        case Symbol.NoteheadCircleXDoubleWhole: return { value: 'circle-x' };
        case Symbol.NoteheadDiamondBlack:
        case Symbol.NoteheadDiamondBlackWide: return { value: 'diamond', filled: true };
        case Symbol.NoteheadDiamondWhite:
        case Symbol.NoteheadDiamondWhiteWide:
        case Symbol.NoteheadDiamondHalf:
        case Symbol.NoteheadDiamondWhole:
        case Symbol.NoteheadDiamondDoubleWhole: return { value: 'diamond', filled: false };
        case Symbol.NoteheadTriangleUpBlack: return { value: 'triangle', filled: true };
        case Symbol.NoteheadTriangleUpHalf:
        case Symbol.NoteheadTriangleUpWhole:
        case Symbol.NoteheadTriangleUpDoubleWhole: return { value: 'triangle', filled: false };
        case Symbol.NoteheadSlashedBlack2: return { value: 'back slashed', filled: true };
        default: return undefined;
    }
}
