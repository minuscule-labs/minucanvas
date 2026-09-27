import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

function copyThemeFiles() {
  return {
    name: 'copy-theme-files',
    async writeBundle() {
      const outDir = resolve(__dirname, 'dist/themes')
      await mkdir(outDir, { recursive: true })
      for (const name of ['light.css', 'dark.css']) {
        const source = await readFile(resolve(__dirname, 'src/theme/themes', name), 'utf8')
        await writeFile(resolve(outDir, name), source)
      }
    },
  }
}

const external = (id: string): boolean =>
  id === 'react' || id === 'react-dom' || id === 'react/jsx-runtime'

export default defineConfig({
  plugins: [
    react(),
    copyThemeFiles(),
    dts({
      include: ['src'],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.tsx'),
        syntax: resolve(__dirname, 'src/syntax/index.ts'),
        mermaid: resolve(__dirname, 'src/mermaid/index.ts'),
      },
      name: 'MinuCanvas',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external,
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css' || assetInfo.name === 'minucanvas.css') {
            return 'theme.css'
          }
          return assetInfo.name ?? 'asset'
        },
      },
    },
    sourcemap: false,
    copyPublicDir: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
