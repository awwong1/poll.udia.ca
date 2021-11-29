import esbuild from 'rollup-plugin-esbuild'

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  input: 'src/index.ts',
  output: {
    exports: 'named',
    format: 'es',
    file: 'dist/index.mjs',
    sourcemap: true
  },
  plugins: [
    esbuild({
      // required for resolving modules
      experimentalBundling: true,
      minify: true,
      loaders: {
        '.html': 'text'
      }
    })
  ]
}
