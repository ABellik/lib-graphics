import { resolve } from 'path'
import { defineConfig } from 'vite'

import dts from 'vite-plugin-dts'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  build: {
    sourcemap: true,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'lib-graphics',
      // the proper extensions will be added
      fileName: (format) => `lib-graphics.${format}.js`
    },
  },
  plugins: [tsconfigPaths(), dts()]
})