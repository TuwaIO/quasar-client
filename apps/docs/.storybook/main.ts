import type { StorybookConfig } from '@storybook/react-vite';
import remarkGfm from 'remark-gfm';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  // Fonts and brand files served from this site, not from Google Fonts or jsDelivr (Cookie and Privacy policies)
  staticDirs: ['../public'],
  addons: [
    {
      // GitHub Flavored Markdown (tables) in MDX pages, including the package READMEs of the Packages section
      name: '@storybook/addon-docs',
      options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: [remarkGfm] } } },
    },
    '@storybook/addon-onboarding',
    '@storybook/addon-themes',
    // axe on every story (the Accessibility panel), and the stories as Vitest tests (`pnpm test:stories`)
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  features: {
    // The review UI is on at runtime unless turned off, and it writes the current page to
    // sessionStorage (`storybook/review/pre-review-return`) on every navigation (Cookie Policy)
    experimentalReview: false,
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },
};

export default config;
