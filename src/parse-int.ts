import { InvalidArgumentError } from '@commander-js/extra-typings';

export function myParseMina(value: string, _previous: number) {
  // parseInt takes a string and a radix
  const parsedValue = parseFloat(value);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Not a number.');
  }
  return parsedValue * 1e9;
}

export function myParseInt(value: string, _previous: number) {
  // parseInt takes a string and a radix
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Not a number.');
  }
  return parsedValue;
}
