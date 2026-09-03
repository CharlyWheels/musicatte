/**
 * Judge and shrink a photo in the browser, before it is uploaded.
 *
 * The scanner was a file picker. Somebody would take a crooked, blurry photo,
 * wait two minutes, get nonsense back and conclude the app did not work --
 * when the photo had never been usable. Checking here costs a second and gives
 * the user something they can act on.
 *
 * Shrinking is the other half: a modern phone photo is 4-12 MB, which used to
 * trip the upload limit and surface as a generic "could not start" message.
 * Recognition resizes everything to 1920px wide anyway, so sending a 4000px
 * original buys nothing.
 */

const TARGET_WIDTH = 2400
const JPEG_QUALITY = 0.88
const MIN_WIDTH = 900
// Variance of the Laplacian. Below this the note heads will not survive
// thresholding; the same threshold the server uses, so the two agree.
const BLUR_THRESHOLD = 55

export async function loadImage(file) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    // Ask the browser to apply EXIF orientation. Without this a portrait photo
    // is analysed sideways -- and a sideways page recognises as nothing.
    image.decoding = 'sync'
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('No se pudo leer la imagen'))
      image.src = url
    })
    return image
  } finally {
    // Revoked after decode; the bitmap is already in memory.
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function toCanvas(image, maxWidth) {
  const scale = Math.min(1, maxWidth / image.naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * scale)
  canvas.height = Math.round(image.naturalHeight * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Variance of the Laplacian on a downscaled grey copy: low means blurry. */
function sharpness(canvas) {
  const width = Math.min(canvas.width, 640)
  const height = Math.round((canvas.height * width) / canvas.width)
  const small = document.createElement('canvas')
  small.width = width
  small.height = height
  const context = small.getContext('2d', { willReadFrequently: true })
  context.drawImage(canvas, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)

  const grey = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  let sum = 0
  let sumSquares = 0
  let count = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      const value =
        4 * grey[index] -
        grey[index - 1] -
        grey[index + 1] -
        grey[index - width] -
        grey[index + width]
      sum += value
      sumSquares += value * value
      count += 1
    }
  }
  if (!count) return 0
  const mean = sum / count
  return sumSquares / count - mean * mean
}

/**
 * Are there staff lines in this photo?
 *
 * A rough check: long runs of dark pixels along rows, repeating down the page.
 * It only has to distinguish "sheet music" from "a photo of a cat", and it
 * runs on the phone, so it stays deliberately cheap.
 */
function looksLikeSheetMusic(canvas) {
  const width = Math.min(canvas.width, 800)
  const height = Math.round((canvas.height * width) / canvas.width)
  const small = document.createElement('canvas')
  small.width = width
  small.height = height
  const context = small.getContext('2d', { willReadFrequently: true })
  context.drawImage(canvas, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)

  // Rows where a good share of the pixels are darker than the row's own
  // midpoint: a staff line spans nearly the whole width.
  let inkyRows = 0
  for (let y = 0; y < height; y += 1) {
    let sum = 0
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      sum += 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
    }
    const rowMean = sum / width
    let dark = 0
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const value = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
      if (value < rowMean - 28) dark += 1
    }
    if (dark > width * 0.55) inkyRows += 1
  }
  // Five lines per staff, at least one staff, and not so many that the whole
  // page is dark.
  return inkyRows >= 4 && inkyRows < height * 0.5
}

/**
 * Analyse a photo and prepare it for upload.
 *
 * @returns {Promise<{ file: File, warnings: string[], advice: string, usable: boolean, width: number, height: number, sharpness: number, shrunkFrom: number|null }>}
 */
export async function preparePhoto(file) {
  if (file.type === 'application/pdf') {
    return {
      file,
      warnings: [],
      advice: 'PDF listo para enviar. Se analizará página por página.',
      usable: true,
      width: 0,
      height: 0,
      sharpness: 0,
      shrunkFrom: null,
    }
  }

  const image = await loadImage(file)
  const canvas = toCanvas(image, TARGET_WIDTH)
  const focus = sharpness(canvas)
  const hasStaves = looksLikeSheetMusic(canvas)

  const warnings = []
  if (image.naturalWidth < MIN_WIDTH) {
    warnings.push('La foto tiene poca resolución: acércate un poco más y repítela.')
  }
  if (focus < BLUR_THRESHOLD) {
    warnings.push('La foto está desenfocada. Apoya los codos y espera a que el móvil enfoque.')
  }
  if (!hasStaves) {
    warnings.push(
      'No encontramos pentagramas. Comprueba que se ve la partitura entera y que hay buena luz.',
    )
  }

  // Only re-encode when it actually saves something.
  let prepared = file
  let shrunkFrom = null
  if (canvas.width < image.naturalWidth) {
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (blob && blob.size < file.size) {
      prepared = new File([blob], renameToJpg(file.name), { type: 'image/jpeg' })
      shrunkFrom = file.size
    }
  }

  return {
    file: prepared,
    warnings,
    advice: warnings.length
      ? warnings[0]
      : `Buena foto: ${image.naturalWidth}×${image.naturalHeight} px, enfoque correcto.`,
    usable: hasStaves && focus >= BLUR_THRESHOLD,
    width: image.naturalWidth,
    height: image.naturalHeight,
    sharpness: Math.round(focus),
    shrunkFrom,
  }
}

function renameToJpg(name) {
  const base = (name || 'partitura').replace(/\.[^.]+$/, '')
  return `${base}.jpg`
}

/** Rotate a photo in quarter turns, for a page that came out sideways. */
export async function rotatePhoto(file, quarterTurns) {
  const turns = ((quarterTurns % 4) + 4) % 4
  if (!turns) return file
  const image = await loadImage(file)
  const swap = turns % 2 === 1
  const canvas = document.createElement('canvas')
  canvas.width = swap ? image.naturalHeight : image.naturalWidth
  canvas.height = swap ? image.naturalWidth : image.naturalHeight
  const context = canvas.getContext('2d')
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((turns * Math.PI) / 2)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  return blob ? new File([blob], renameToJpg(file.name), { type: 'image/jpeg' }) : file
}

export { BLUR_THRESHOLD, TARGET_WIDTH }
