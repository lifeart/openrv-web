/**
 * CLI entry point for AI-assisted documentation generation.
 *
 * Usage:
 *   npx tsx docs/scripts/ai-generate.ts --module <name>
 *   npx tsx docs/scripts/ai-generate.ts --all
 *   npx tsx docs/scripts/ai-generate.ts --all --dry-run
 *   npx tsx docs/scripts/ai-generate.ts --changed-only
 *   npx tsx docs/scripts/ai-generate.ts --help
 *
 * Options:
 *   --module <name>    Generate docs for a specific module (by key)
 *   --all              Generate docs for all modules
 *   --dry-run          Estimate cost without making API calls (no API key needed)
 *   --template <type>  Override the template type for the module
 *   --changed-only     Only regenerate modules whose source files have changed
 *   --no-cache         Skip cache check, regenerate even if unchanged
 *   --help, -h         Show help
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAllModuleConfigs, getModuleConfig, listModuleKeys, type ModuleConfig } from './modules.js';
import { buildPrompt, type TemplateType, getTemplateTypes } from './lib/templates.js';
import { generateDoc, dryRunEstimate, getCostTracker, DEFAULT_MODEL, OPUS_MODEL } from './lib/claude-client.js';
import { writeOutput } from './lib/output.js';
import { computeHash, isCached, updateCache } from './lib/cache.js';
import { CostTracker, estimateCost } from './lib/rate-limiter.js';
import { mapChangedFilesToModules, saveCurrentSha } from './detect-changes.js';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '../..');

interface CliArgs {
  module?: string;
  all: boolean;
  dryRun: boolean;
  template?: TemplateType;
  changedOnly: boolean;
  noCache: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    all: false,
    dryRun: false,
    changedOnly: false,
    noCache: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--module':
        result.module = args[++i];
        break;
      case '--all':
        result.all = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--template':
        result.template = args[++i] as TemplateType;
        break;
      case '--changed-only':
        result.changedOnly = true;
        break;
      case '--no-cache':
        result.noCache = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`AI Documentation Generator for OpenRV Web

Usage:
  npx tsx docs/scripts/ai-generate.ts [options]

Options:
  --module <name>    Generate docs for a specific module (by key)
  --all              Generate docs for all modules
  --dry-run          Estimate cost without making API calls
  --template <type>  Override the template type
  --changed-only     Only regenerate modules with changed source files
  --no-cache         Skip cache, force regeneration
  --help, -h         Show this help

Available modules:
${listModuleKeys().map((k) => `  ${k}`).join('\n')}

Available templates:
${getTemplateTypes().map((t) => `  ${t}`).join('\n')}
`);
}

/**
 * Read source files for a module, returning a map of path -> content.
 */
function readSourceFiles(mod: ModuleConfig): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const relPath of mod.sourceFiles) {
    const absPath = resolve(ROOT, relPath);
    if (existsSync(absPath)) {
      sources[relPath] = readFileSync(absPath, 'utf-8');
    } else {
      console.warn(`  Warning: source file not found: ${relPath}`);
    }
  }
  return sources;
}

/**
 * Process a single module: build prompt, call API (or dry-run), write output.
 */
async function processModule(mod: ModuleConfig, opts: CliArgs): Promise<void> {
  const templateType = opts.template || mod.template;
  const model = mod.useOpus ? OPUS_MODEL : DEFAULT_MODEL;

  console.log(`\nModule: ${mod.key} (${mod.name})`);
  console.log(`  Template: ${templateType}, Model: ${model}`);

  // Read source files
  const sources = readSourceFiles(mod);
  if (Object.keys(sources).length === 0) {
    console.log('  Skipping: no source files found.');
    return;
  }

  // Build prompt
  const meta = {
    moduleName: mod.name,
    filePaths: mod.sourceFiles,
    category: mod.category,
  };
  const prompt = buildPrompt(templateType, sources, meta);

  // Cache check
  if (!opts.noCache && !opts.dryRun) {
    const templateContent = prompt.systemPrompt + prompt.userPrompt;
    const hash = computeHash(templateContent, sources);
    const cacheKey = `${mod.category}/${mod.outputName}`;

    if (isCached(cacheKey, hash)) {
      console.log('  Skipping: cached (no changes to template or source files).');
      return;
    }
  }

  if (opts.dryRun) {
    // Dry-run: estimate cost without API call
    const estimate = dryRunEstimate(prompt.userPrompt, {
      model,
      maxTokens: prompt.maxTokens,
      systemPrompt: prompt.systemPrompt,
    });
    console.log(`  [DRY RUN] Input: ~${estimate.inputTokens} tokens, Output: ~${estimate.outputTokens} tokens`);
    console.log(`  [DRY RUN] Estimated cost: $${estimate.totalCost.toFixed(4)}`);
    return;
  }

  // Make API call
  console.log('  Generating...');
  const content = await generateDoc(prompt.userPrompt, {
    model,
    maxTokens: prompt.maxTokens,
    temperature: prompt.temperature,
    systemPrompt: prompt.systemPrompt,
  });

  // Write output
  writeOutput({
    category: mod.category,
    moduleName: mod.outputName,
    content,
    sourceFiles: mod.sourceFiles,
    template: templateType,
    model,
  });

  // Update cache
  const templateContent = prompt.systemPrompt + prompt.userPrompt;
  const hash = computeHash(templateContent, sources);
  const { getOutputPath } = await import('./lib/output.js');
  const outputPath = getOutputPath(mod.category, mod.outputName);
  updateCache(`${mod.category}/${mod.outputName}`, hash, outputPath);
}

// --- Main ---
async function main(): Promise<void> {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  if (!opts.module && !opts.all && !opts.changedOnly) {
    console.error('Error: specify --module <name>, --all, or --changed-only.');
    console.error('Use --help for available options.');
    process.exit(1);
  }

  let modules: ModuleConfig[];

  if (opts.module) {
    const mod = getModuleConfig(opts.module);
    if (!mod) {
      console.error(`Error: unknown module "${opts.module}".`);
      console.error(`Available modules:\n${listModuleKeys().map((k) => `  ${k}`).join('\n')}`);
      process.exit(1);
    }
    modules = [mod];
  } else if (opts.changedOnly) {
    // Detect changed files via git
    const lastShaFile = resolve(import.meta.dirname, '../generated/.last-gen-sha');
    let baseSha: string | null = null;
    if (existsSync(lastShaFile)) {
      baseSha = readFileSync(lastShaFile, 'utf-8').trim();
    }

    if (!baseSha) {
      console.log('No previous generation SHA found. Falling back to --all.');
      modules = getAllModuleConfigs();
    } else {
      try {
        const output = execSync(`git diff --name-only ${baseSha}..HEAD -- src/`, {
          encoding: 'utf-8',
          cwd: ROOT,
        });
        const changedFiles = output.trim().split('\n').filter(Boolean);
        modules = mapChangedFilesToModules(changedFiles);

        if (modules.length === 0) {
          console.log('No documentation modules affected by recent changes.');
          process.exit(0);
        }

        console.log(`Found ${modules.length} module(s) affected by changes since ${baseSha.slice(0, 8)}.`);
      } catch {
        console.error('Failed to detect changes. Falling back to --all.');
        modules = getAllModuleConfigs();
      }
    }
  } else {
    modules = getAllModuleConfigs();
  }

  console.log(`Processing ${modules.length} module(s)...`);
  if (opts.dryRun) {
    console.log('[DRY RUN MODE - no API calls will be made]');
  }

  const dryRunTracker = new CostTracker();

  for (const mod of modules) {
    try {
      if (opts.dryRun) {
        // Track dry-run costs
        const templateType = opts.template || mod.template;
        const model = mod.useOpus ? OPUS_MODEL : DEFAULT_MODEL;
        const sources = readSourceFiles(mod);
        const meta = { moduleName: mod.name, filePaths: mod.sourceFiles, category: mod.category };
        const prompt = buildPrompt(templateType, sources, meta);
        const fullInput = prompt.systemPrompt + prompt.userPrompt;
        const estimate = estimateCost(fullInput, prompt.maxTokens, model);
        dryRunTracker.record(estimate);
      }
      await processModule(mod, opts);
    } catch (err) {
      console.error(`  Error processing ${mod.key}:`, err instanceof Error ? err.message : err);
    }
  }

  if (opts.dryRun) {
    dryRunTracker.logSummary();
  } else {
    getCostTracker().logSummary();

    // Update last-gen SHA on successful non-dry-run
    if (opts.changedOnly || opts.all) {
      saveCurrentSha();
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
