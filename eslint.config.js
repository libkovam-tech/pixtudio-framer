import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '.codex-backups/**',
    'tools/ffmpeg-core-custom/upstream/**',
    'tools/ffmpeg-core-custom/output/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: [
      'src/editor/**/*.{ts,tsx}',
      'src/editor/PixelEditorFramer.tsx',
      'src/editor/SmartReferenceEditor.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/exhaustive-deps': 'off',
      // React Compiler is not enabled yet. Keep these refactor-heavy rules
      // out of the baseline until the editor is decomposed in smaller steps.
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/hub/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
