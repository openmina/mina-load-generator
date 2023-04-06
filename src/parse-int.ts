import { InvalidArgumentError } from '@commander-js/extra-typings';

export function myParseInt(value: string, _previous: number) {
  // parseInt takes a string and a radix
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Not a number.');
  }
  return parsedValue;
}
