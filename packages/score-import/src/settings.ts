// SPDX-License-Identifier: MPL-2.0
import type { Settings } from '@coderline/alphatab/Settings';
import { NotationSettings } from '@coderline/alphatab/NotationSettings';
import { ImporterSettings } from '@coderline/alphatab/ImporterSettings';
import { ScoreImportError } from './types';

/**
 * A structurally checked Settings implementation for GPIF/model finalization.
 * Constructing alphaTab's full Settings pulls Environment, renderers and players
 * into the import bundle. Do not fake a partial Settings with a type assertion:
 * implement its full contract, and fail explicitly if an upstream reader starts
 * depending on a subsystem outside this audited boundary.
 */
export class ImportSettings implements Settings {
    public readonly notation = new NotationSettings();
    public readonly importer = new ImporterSettings();
    public get core(): Settings['core'] { return this.unsupported('core'); }
    public get display(): Settings['display'] { return this.unsupported('display'); }
    public get player(): Settings['player'] { return this.unsupported('player'); }
    public get exporter(): Settings['exporter'] { return this.unsupported('exporter'); }
    public setSongBookModeSettings(): void { this.unsupported('songbook'); }
    public fillFromJson(_json: Parameters<Settings['fillFromJson']>[0]): void { this.unsupported('JSON settings'); }
    public handleBackwardsCompatibility(): void { this.unsupported('compatibility'); }
    private unsupported(subsystem: string): never {
        throw new ScoreImportError('import-boundary', `The source reader unexpectedly requires ${subsystem} settings. Review the headless import boundary.`);
    }
}
