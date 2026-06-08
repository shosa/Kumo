const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100']
}

function normalizeSender(sender) {
  const raw = String(sender || '').trim()
  const namePart = raw.includes('<') ? raw.slice(0, raw.indexOf('<')).trim() : ''
  const emailPart = raw.match(/<([^>]+)>/)?.[1] || raw
  const source = namePart.replace(/^["']|["']$/g, '') || emailPart.split('@')[0]
  return source
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getNotificationInitials(sender) {
  const normalized = normalizeSender(sender)
  if (!normalized) return '?'
  const parts = normalized.split(' ').filter(Boolean)
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0].slice(0, 2)
  return initials.toUpperCase()
}

function colorFromSeed(seed) {
  let hash = 5381
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 33 ^ seed.charCodeAt(index)) & 0xffffffff
  }
  const hue = (Math.abs(hash) % 360) / 360
  const saturation = 0.6
  const lightness = 0.45
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const hueToRgb = value => {
    let adjusted = value
    if (adjusted < 0) adjusted += 1
    if (adjusted > 1) adjusted -= 1
    if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted
    if (adjusted < 1 / 2) return q
    if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6
    return p
  }
  return [
    Math.round(hueToRgb(hue + 1 / 3) * 255),
    Math.round(hueToRgb(hue) * 255),
    Math.round(hueToRgb(hue - 1 / 3) * 255)
  ]
}

function setPixel(buffer, size, x, y, red, green, blue, alpha = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const offset = (y * size + x) * 4
  buffer[offset] = red
  buffer[offset + 1] = green
  buffer[offset + 2] = blue
  buffer[offset + 3] = alpha
}

function drawGlyph(buffer, size, glyph, startX, startY, scale, color) {
  const pattern = GLYPHS[glyph] || GLYPHS['?']
  for (let row = 0; row < pattern.length; row++) {
    for (let column = 0; column < pattern[row].length; column++) {
      if (pattern[row][column] !== '1') continue
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          setPixel(
            buffer,
            size,
            startX + column * scale + x,
            startY + row * scale + y,
            ...color
          )
        }
      }
    }
  }
}

export function createNotificationAvatarBitmap(sender, size = 64) {
  const initials = getNotificationInitials(sender)
  const buffer = Buffer.alloc(size * size * 4)
  const [red, green, blue] = colorFromSeed(String(sender || '?'))
  const center = size / 2 - 0.5
  const radius = size / 2 - 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.sqrt((x - center) ** 2 + (y - center) ** 2)
      const alpha = Math.max(0, Math.min(1, radius + 1 - distance)) * 255
      if (alpha > 0) {
        setPixel(buffer, size, x, y, red, green, blue, Math.round(alpha))
      }
    }
  }

  const scale = initials.length === 1 ? Math.max(4, Math.floor(size / 10)) : Math.max(3, Math.floor(size / 16))
  const glyphWidth = 5 * scale
  const gap = Math.max(2, scale)
  const totalWidth = initials.length * glyphWidth + (initials.length - 1) * gap
  const startX = Math.round((size - totalWidth) / 2)
  const startY = Math.round((size - 7 * scale) / 2)

  for (let index = 0; index < initials.length; index++) {
    const x = startX + index * (glyphWidth + gap)
    drawGlyph(buffer, size, initials[index], x, startY, scale, [255, 255, 255, 255])
  }

  return { buffer, initials, color: [red, green, blue] }
}
