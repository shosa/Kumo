export const KUMO_BANNER_LINES = [
  '##   ## ##    ##  ###    ###   ######',
  '##  ##  ##    ##  ####  ####  ##    ##',
  '#####   ##    ##  ##  ##  ##  ##    ##',
  '##  ##  ##    ##  ##      ##  ##    ##',
  '##   ##   ####    ##      ##   ######'
]

const RAINBOW = [
  [255, 77, 109],
  [255, 159, 28],
  [255, 214, 10],
  [53, 208, 127],
  [76, 201, 240]
]

export function printKumoTerminalBanner(write = text => console.log(text)) {
  const lines = KUMO_BANNER_LINES.map((line, index) => {
    const [red, green, blue] = RAINBOW[index]
    const color = `\x1b[48;2;${red};${green};${blue}m`
    return line.replace(/#+/g, blocks => `${color}${' '.repeat(blocks.length)}\x1b[0m`)
  })
  write(`\n${lines.join('\n')}\n`)
}
