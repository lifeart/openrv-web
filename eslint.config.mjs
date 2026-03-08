import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'docs/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.d.ts',
      '.claude/**',
      'e2e/**',
      'scripts/**',
      'test-assets/**',
      'tests/**',
      'parse_coverage.cjs',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
        VideoFrame: 'readonly',
        VideoDecoder: 'readonly',
        VideoEncoder: 'readonly',
        ImageBitmap: 'readonly',
        OffscreenCanvas: 'readonly',
      },
      // Note: projectService/tsconfigRootDir omitted to avoid OOM on 1000+ files.
      // Enable when adding type-aware rules (no-floating-promises, await-thenable).
    },
    plugins: { 'import-x': importPlugin },
    rules: {
      // Style
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
      'no-throw-literal': 'error',

      // TypeScript
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-useless-assignment': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn',
      'preserve-caught-error': 'off',

      // Imports
      // Note: import-x/order disabled for initial setup (too disruptive on 1000+ files).
      // Enable incrementally with IDE auto-fix support.
      'import-x/no-duplicates': 'error',
    },
  },

  // Test file overrides
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test-helper.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-console': 'off',
    },
  },

  // Node.js environment files
  {
    files: ['test/**/*.ts', 'vitest.config.*'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Worker overrides
  {
    files: ['src/workers/**/*.ts'],
    languageOptions: { globals: { ...globals.worker, self: 'readonly' } },
  },
);
