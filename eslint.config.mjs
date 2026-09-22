import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

/**
 * ESLint 9 flat config.
 *
 * `eslint-config-next` ships flat config arrays from version 16, so they are
 * imported directly. Do not wrap them in `FlatCompat` again: that shim expects
 * the old `.eslintrc` shape, and handed a flat config it crashes with
 * "Converting circular structure to JSON" rather than saying what is wrong.
 *
 * Keep it on the same major as `next` itself - npm will happily install the
 * next major, which lints for a framework version this app is not on.
 */
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
  ...nextVitals,
  ...nextTypescript,

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
