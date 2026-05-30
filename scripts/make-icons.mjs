// Generate app icons from build/icon.svg:
//   build/icon.png  (1024x1024, also used as the dev window icon)
//   build/icon.ico  (Windows)
//   build/icon.icns (macOS)
// Run with:  npm run icons
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import png2icons from 'png2icons'

const svg = readFileSync('build/icon.svg', 'utf8')
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng()
writeFileSync('build/icon.png', png)

writeFileSync('build/icon.ico', png2icons.createICO(png, png2icons.BICUBIC, 0, false))
writeFileSync('build/icon.icns', png2icons.createICNS(png, png2icons.BICUBIC, 0))

console.log('Wrote build/icon.png, build/icon.ico, build/icon.icns')
