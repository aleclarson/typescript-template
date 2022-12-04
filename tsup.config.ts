import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['{{format}}'],
  clean: true,
  dts: true,
})
