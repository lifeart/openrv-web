/**
 * ExporterRegistry - Single source of truth for export format contributions.
 *
 * The PluginRegistry delegates exporter registration here, matching the
 * pattern used for decoderRegistry and NodeFactory.
 */

import type { ExporterContribution } from './types';

class ExporterRegistryClass {
  private exporters = new Map<string, ExporterContribution>();

  register(name: string, exporter: ExporterContribution): void {
    this.exporters.set(name, exporter);
  }

  unregister(name: string): boolean {
    return this.exporters.delete(name);
  }

  get(name: string): ExporterContribution | undefined {
    return this.exporters.get(name);
  }

  getAll(): Map<string, ExporterContribution> {
    return new Map(this.exporters);
  }
}

export const ExporterRegistry = new ExporterRegistryClass();
