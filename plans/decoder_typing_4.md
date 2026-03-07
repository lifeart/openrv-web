# Implementation Plan: Strengthening Decoder Options Typing

## 1. Current State Analysis

**The problem**: The `FormatDecoder` interface in `src/formats/DecoderRegistry.ts` defines:

```typescript
export interface FormatDecoder {
  formatName: string;
  canDecode(buffer: ArrayBuffer): boolean;
  decode(
    buffer: ArrayBuffer,
    options?: Record<string, unknown>
  ): Promise<DecodeResult>;
}
```

The `Record<string, unknown>` type erases all type information. In the adapter code, options are extracted via unsafe casts like `(options?.applyLogToLinear as boolean)`.

**Existing typed options** (already defined but not used in the registry interface):
- `EXRDecodeOptions` — `{ layer?: string; channelRemapping?: EXRChannelRemapping; partIndex?: number }`
- `DPXDecodeOptions` — `{ applyLogToLinear?: boolean; logLinearOptions?: LogLinearOptions }`
- `CineonDecodeOptions` — `{ applyLogToLinear?: boolean; logLinearOptions?: LogLinearOptions }`
- `JP2DecodeOptions` — `{ maxResolutionLevel?: number; region?: { x, y, w, h } }`

**Decoders that currently ignore options** (11 of 13): exr, tiff, jpeg-gainmap, heic-gainmap, avif-gainmap, avif, raw-preview, hdr, jxl, jp2, mxf.

**Decoders that use options unsafely** (2 of 13): dpx, cineon.

**Decoders with typed options that are not wired through the adapter** (2): exr (has `EXRDecodeOptions`), jp2 (has `JP2DecodeOptions`).

---

## 2. Recommended Approach: Generic Type Parameter with Options Map

Uses a **format-to-options type map** combined with a **generic `FormatDecoder<T>` interface**. This gives:
- Full IDE autocomplete when the format is known at compile time
- Backward compatibility (the untyped path still works)
- Incremental adoption (decoders can be migrated one at a time)
- Plugin compatibility (plugins use `FormatDecoder` which defaults to `Record<string, unknown>`)

### 2a. Define the Options Map

Add a new type in `DecoderRegistry.ts`. **Note:** The codebase already has a `BuiltinFormatName` union type that can be reused as the key constraint for this map.

```typescript
/** Map from format name to its decoder-specific options type.
 *  Keys align with existing BuiltinFormatName union. */
export interface DecoderOptionsMap {
  'exr': EXRDecodeOptions;
  'DPX': DPXDecodeOptions;
  'Cineon': CineonDecodeOptions;
  'TIFF': {};
  'jpeg-gainmap': {};
  'heic-gainmap': {};
  'avif-gainmap': {};
  'avif': {};
  'raw-preview': {};
  'hdr': {};
  'jxl': {};
  'jp2': JP2DecodeOptions;
  'mxf': {};
}
```

This is a **declaration merging** friendly interface — plugins can extend it:
```typescript
declare module 'openrv-web/formats/DecoderRegistry' {
  interface DecoderOptionsMap {
    'my-plugin-format': { quality?: number };
  }
}
```

### 2b. Make FormatDecoder Generic

```typescript
export interface FormatDecoder<TOptions = Record<string, unknown>> {
  formatName: string;
  canDecode(buffer: ArrayBuffer): boolean;
  decode(
    buffer: ArrayBuffer,
    options?: TOptions
  ): Promise<DecodeResult>;
}
```

The default generic parameter `Record<string, unknown>` ensures all existing code that references `FormatDecoder` (without a type argument) continues to work unchanged.

### 2c. Add a Typed Decode Helper

```typescript
/** Type-safe decode: infers the correct options type from the format name */
export function decodeAs<F extends keyof DecoderOptionsMap>(
  registry: DecoderRegistry,
  formatName: F,
  buffer: ArrayBuffer,
  options?: DecoderOptionsMap[F]
): Promise<DecodeResult & { formatName: F }> {
  const decoder = registry.getDecoderByName(formatName);
  if (!decoder) {
    throw new Error(`No decoder registered for format: ${formatName}`);
  }
  return decoder.decode(buffer, options as Record<string, unknown>)
    .then(result => ({ ...result, formatName }));
}
```

This requires adding a `getDecoderByName` method to `DecoderRegistry`:

```typescript
getDecoderByName(name: string): FormatDecoder | null {
  return this.decoders.find(d => d.formatName === name) ?? null;
}
```

### 2d. Type the Individual Adapter Declarations

Use `satisfies` to validate the adapter shape while keeping the inferred type:

```typescript
const dpxDecoder = {
  formatName: 'DPX' as const,
  canDecode: isDPXFile,
  async decode(buffer: ArrayBuffer, options?: DPXDecodeOptions) {
    const result = await decodeDPX(buffer, {
      applyLogToLinear: options?.applyLogToLinear ?? false,
      logLinearOptions: options?.logLinearOptions,
    });
    return { /* ... */ };
  },
} satisfies FormatDecoder<DPXDecodeOptions>;
```

Then in the array: `this.decoders.push(dpxDecoder as FormatDecoder)` — the `as FormatDecoder` is safe because the adapter implementation handles missing/extra properties gracefully via optional parameters.

**Note:** The `satisfies` operator is not currently used elsewhere in this codebase. For consistency, you may prefer using `as FormatDecoder<DPXDecodeOptions>` type assertions instead of `satisfies`, though `satisfies` provides stronger type checking at the definition site.

---

## 3. Files That Need Changes

| File | Change | Complexity |
|------|--------|-----------|
| `src/formats/DecoderRegistry.ts` | Add `DecoderOptionsMap`, make `FormatDecoder` generic, add `getDecoderByName`, add `decodeAs`, type all 13 adapters | Medium |
| `src/formats/index.ts` | Export new types: `DecoderOptionsMap`, `decodeAs` | Trivial |
| `src/formats/DecoderRegistry.test.ts` | Update test custom decoders to use new types, add tests for `decodeAs` and `getDecoderByName` | Small |
| `src/plugin/types.ts` | Verify `registerDecoder` stays compatible with generic `FormatDecoder` | None/Trivial |
| `src/nodes/sources/FileSourceNode.ts` | Optionally use `decodeAs` for type-safe calls when format is known | Optional |

### Required Imports in DecoderRegistry.ts

```typescript
import type { DPXDecodeOptions } from './DPXDecoder';
import type { CineonDecodeOptions } from './CineonDecoder';
import type { EXRDecodeOptions } from './EXRDecoder';
import type { JP2DecodeOptions } from './JP2Decoder';
```

These are `import type` — erased at runtime, no module dependency created.

---

## 4. Migration Strategy (Incremental, 3 Phases)

### Phase 1 — Foundation (non-breaking)
1. Add `DecoderOptionsMap` interface to `DecoderRegistry.ts`
2. Make `FormatDecoder` generic with default `Record<string, unknown>`
3. Add `getDecoderByName()` method
4. Add `decodeAs()` helper function
5. Export new types from `index.ts`
6. **All existing code compiles without changes**

### Phase 2 — Wire typed options (non-breaking)
1. Add type imports for `DPXDecodeOptions`, `CineonDecodeOptions`, `EXRDecodeOptions`, `JP2DecodeOptions`
2. Update dpxDecoder and cineonDecoder adapters to use typed options (remove unsafe casts)
3. Wire `EXRDecodeOptions` through exrDecoder adapter (currently ignored)
4. Wire `JP2DecodeOptions` through jp2Decoder adapter (currently ignored)
5. Use `satisfies FormatDecoder<T>` on typed adapters

### Phase 3 — Consumer adoption (incremental)
1. Update `FileSourceNode.loadHDRFromBuffer` to optionally use `decodeAs()` when format is pre-detected
2. Update any other consumers to prefer `decodeAs()` over `detectAndDecode()` when format is known
3. Add documentation for plugin authors on how to extend `DecoderOptionsMap` via declaration merging

---

## 5. Concrete Before/After Example

**Before** (caller in FileSourceNode):
```typescript
const result = await decoderRegistry.detectAndDecode(buffer, { applyLogToLinear: true });
// No autocomplete on options, no type checking
```

**After** (type-safe path when format is known):
```typescript
import { decodeAs } from '../formats/DecoderRegistry';

const result = await decodeAs(decoderRegistry, 'DPX', buffer, {
  applyLogToLinear: true,     // autocomplete works
  logLinearOptions: { ... },  // autocomplete works
  // typo: 'apllyLogToLinear' would be a compile error
});
```

**After** (generic path unchanged):
```typescript
// When format is unknown (runtime detection) — no change required:
const result = await decoderRegistry.detectAndDecode(buffer, { applyLogToLinear: true });
```

---

## 6. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking plugin code that implements `FormatDecoder` | Default generic parameter ensures `FormatDecoder` (without args) remains identical |
| Variance issues with `decoders: FormatDecoder[]` | Use `satisfies` + `as FormatDecoder` cast at array insertion |
| Over-engineering for decoders that have no options | Use empty object `{}` in the map; no runtime cost |
| Import cycles from type imports | Use `import type` which is erased at compile time |
| Test breakage | Phase 1 is fully backward-compatible; test updates needed only for new functionality |
