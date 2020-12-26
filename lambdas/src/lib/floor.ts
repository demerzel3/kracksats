import { curry } from 'ramda'

import numberToString from './numberToString'

// http://www.jacklmoore.com/notes/rounding-in-javascript/
const floor = curry((precision: number, value: number) =>
  Number(
    Math.floor(Number(numberToString(value) + 'e' + precision)) +
      'e-' +
      precision
  )
)

export default floor
