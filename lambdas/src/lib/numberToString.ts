import { compose, concat, contains, replace, split, when } from 'ramda'

const numberToString: (input: number) => string = (input) =>
  when(
    contains('e-'),
    compose(
      ([value, precision]) =>
        concat(
          Number(0).toFixed(parseInt(precision) - 1),
          replace('.', '', value)
        ),
      split('e-')
    ),
    String(input)
  )

export default numberToString
