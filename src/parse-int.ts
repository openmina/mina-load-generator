import { InvalidArgumentError } from '@commander-js/extra-typings';
import { PublicKey } from 'snarkyjs';

export function myParseMina(value: string, _previous: number) {
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

export function _myParseAccount(value: string) {
  try {
    return PublicKey.fromBase58(value);
  } catch {
    throw new InvalidArgumentError(`Not an account: {value}`);
  }
}

export function myParseAccount(value: string, _previous: PublicKey) {
  return _myParseAccount(value);
}

export function myParseAccounts(value: string, previous: PublicKey[]) {
  console.log('>>> ', value);
  return previous.concat(_myParseAccount(value));
}
