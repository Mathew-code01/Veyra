import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-electron', 'dist-server', 'build', 'node_modules', 'workers', '**/*.d.ts']),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': 'off',
      'no-constant-binary-expression': 'off',
      'no-control-regex': 'off',
      'no-useless-assignment': 'off',
      'no-redeclare': 'off',
      'no-unreachable': 'off',
      'preserve-caught-error': 'off',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
])