const {
    compose,
    concat,
    contains,
    replace,
    split,
    when,
} = require('ramda');

module.exports = compose(
    when(contains('e-'), compose(
      ([value, precision]) => concat(
        Number(0).toFixed(precision - 1),
        replace('.', '', value)
      ),
      split('e-')
    )),
    String
  );
