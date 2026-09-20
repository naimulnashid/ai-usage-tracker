import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-config-prettier';

/**
 * ESLint 9 flat config.
 *
 * `eslint-config-next` is still written in the old `.eslintrc` shape, so it is
 * loaded through FlatCompat rather than imported directly. Keep it pinned to
 * the same major as `next` itself - npm will happily install the next major,
 * which lints for a framework version this app is not on.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'data/**',
      'logs/**',
      'public/**',
      'next-env.d.ts',
    ],
  },

  // Next's own rules, plus the React, hooks, import and jsx-a11y sets it pulls
  // in. `core-web-vitals` is the stricter of the two Next presets.
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      /*
       * `<img>` is deliberate in three places: the agent marks, project logos
       * and the login mark. They are local files of unknown dimensions on a
       * localhost-only page, and next/image would need a loader configured to
       * buy nothing. The rule exists to protect Core Web Vitals on public
       * sites, which this is not.
       */
      '@next/next/no-img-element': 'off',

      // A deliberately unused parameter or catch binding is written with a
      // leading underscore in this codebase.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  {
    // The tests render components to static markup and poke at internals.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Last: turns off everything that would fight Prettier over formatting.
  prettier,
];

export default config;
