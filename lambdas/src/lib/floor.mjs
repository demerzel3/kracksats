import {
    curry,
} from 'ramda';

import numberToString from './numberToString';

// http://www.jacklmoore.com/notes/rounding-in-javascript/
export default curry((precision, value) => Number(Math.floor(numberToString(value)+'e'+precision)+'e-'+precision));
