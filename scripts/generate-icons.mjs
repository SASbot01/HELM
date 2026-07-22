#!/usr/bin/env node
// scripts/generate-icons.mjs
//
// Genera la suite de iconos (PNG varios tamaños + .icns Mac + .ico Win) para
// cada tenant a partir de su _logoSource en tenants.json.
//
// Uso:
//   pnpm icons:generate              # Todos los tenants
//   pnpm icons:generate --tenant=enformaconhugo
//   pnpm icons:generate --default    # Solo el default BlackWolf
//
// Requiere: ImageMagick (convert) o sharp opcional. Si no, escribe stubs y avisa.
//
// Output: src-tauri/icons/<slug>/
//   ├── 32x32.png
//   ├── 128x128.png
//   ├── 128x128@2x.png  (256x256)
//   ├── 512x512.png
//   ├── icon.icns       (Mac)
//   └── icon.ico        (Win)

import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const args = process.argv.slice(2)
const onlyTenant = args.find(a => a.startsWith('--tenant='))?.split('=')[1]
const onlyDefault = args.includes('--default')

const SIZES = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: '512x512.png', size: 512 },
]

// Detectar herramientas disponibles
const hasImageMagick = spawnSync('which', ['convert'], { encoding: 'utf8' }).status === 0
const hasIconUtil = spawnSync('which', ['iconutil'], { encoding: 'utf8' }).status === 0
const hasSips = spawnSync('which', ['sips'], { encoding: 'utf8' }).status === 0

if (!hasImageMagick) {
  console.warn('⚠️  ImageMagick (convert) no detectado.')
  console.warn('   Instalación: apt install imagemagick (Linux) | brew install imagemagick (Mac)')
  console.warn('   Sin esto, los PNGs se generan via copia bruta (no resized).')
}

const tenants = JSON.parse(readFileSync(resolve(repoRoot, 'src-tauri/tenants.json'), 'utf8'))

function generateForTenant(slug, tenantConf) {
  const outDir = resolve(repoRoot, 'src-tauri/icons', slug)
  mkdirSync(outDir, { recursive: true })

  const sourceLogo = resolve(repoRoot, tenantConf._logoSource || tenants._default._logoSource || '../public/assets/logos/blackwolf.png')

  if (!existsSync(sourceLogo)) {
    console.warn(`⚠️  ${slug}: source logo not found at ${sourceLogo}`)
    console.warn(`   Skipping icon generation. Edit tenants.json[_logoSource].`)
    return
  }

  console.log(`\n📦 Generating icons for tenant '${slug}'`)
  console.log(`   source: ${sourceLogo}`)
  console.log(`   output: ${outDir}`)

  // PNG sizes
  for (const { name, size } of SIZES) {
    const out = resolve(outDir, name)
    if (hasImageMagick) {
      try {
        execSync(`convert "${sourceLogo}" -resize ${size}x${size} -background transparent "${out}"`, { stdio: 'pipe' })
        console.log(`   ✓ ${name}`)
      } catch (err) {
        console.warn(`   ⚠ ${name} failed: ${err.message}`)
      }
    } else {
      // Fallback: copy without resize
      copyFileSync(sourceLogo, out)
      console.log(`   ✓ ${name} (copied raw, no resize — install ImageMagick for proper sizing)`)
    }
  }

  // .icns Mac (requires iconutil — solo Mac)
  if (hasIconUtil) {
    const iconsetDir = resolve(outDir, 'icon.iconset')
    mkdirSync(iconsetDir, { recursive: true })
    const iconsetSizes = [
      [16, 'icon_16x16.png'],
      [32, 'icon_16x16@2x.png'],
      [32, 'icon_32x32.png'],
      [64, 'icon_32x32@2x.png'],
      [128, 'icon_128x128.png'],
      [256, 'icon_128x128@2x.png'],
      [256, 'icon_256x256.png'],
      [512, 'icon_256x256@2x.png'],
      [512, 'icon_512x512.png'],
      [1024, 'icon_512x512@2x.png'],
    ]
    if (hasImageMagick) {
      for (const [size, name] of iconsetSizes) {
        try {
          execSync(`convert "${sourceLogo}" -resize ${size}x${size} "${resolve(iconsetDir, name)}"`, { stdio: 'pipe' })
        } catch {}
      }
      try {
        execSync(`iconutil -c icns -o "${resolve(outDir, 'icon.icns')}" "${iconsetDir}"`, { stdio: 'pipe' })
        console.log(`   ✓ icon.icns`)
        execSync(`rm -rf "${iconsetDir}"`, { stdio: 'pipe' })
      } catch (err) {
        console.warn(`   ⚠ icon.icns failed: ${err.message}`)
      }
    }
  } else {
    console.log(`   - icon.icns skipped (iconutil not available; build will fail on Mac without it)`)
  }

  // .ico Win (ImageMagick)
  if (hasImageMagick) {
    const ico = resolve(outDir, 'icon.ico')
    try {
      execSync(`convert "${sourceLogo}" -define icon:auto-resize=256,128,64,48,32,16 "${ico}"`, { stdio: 'pipe' })
      console.log(`   ✓ icon.ico`)
    } catch (err) {
      console.warn(`   ⚠ icon.ico failed: ${err.message}`)
    }
  }
}

if (onlyDefault) {
  generateForTenant('default', tenants._default)
} else if (onlyTenant) {
  if (!tenants.tenants[onlyTenant]) {
    console.error(`❌ Tenant '${onlyTenant}' not in tenants.json`)
    process.exit(1)
  }
  generateForTenant(onlyTenant, tenants.tenants[onlyTenant])
} else {
  generateForTenant('default', tenants._default)
  for (const [slug, conf] of Object.entries(tenants.tenants)) {
    generateForTenant(slug, conf)
  }
}

console.log('\n✅ Icon generation complete.')
console.log('   If any tenants reported missing source logo, edit tenants.json[<slug>]._logoSource')
console.log('   and re-run with --tenant=<slug>.')
