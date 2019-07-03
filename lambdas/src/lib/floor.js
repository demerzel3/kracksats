const {
    curry,
} = require('ramda');

const numberToString = require('./numberToString');

// http://www.jacklmoore.com/notes/rounding-in-javascript/
module.exports = curry((precision, value) => Number(Math.floor(numberToString(value)+'e'+precision)+'e-'+precision));
