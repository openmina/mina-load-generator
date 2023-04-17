import { Command } from '@commander-js/extra-typings';
import { PrivateKey } from 'snarkyjs';

export interface LoadDescriptor {
  initialize(account: PrivateKey): Promise<void>;
  transactionBody(): () => void;
  finalize(url: string): Promise<void>;
  signers?: PrivateKey[];
}

export abstract class AbstractLoad implements LoadDescriptor {
  initialize(_: PrivateKey): Promise<void> {
    return Promise.resolve();
  }
  abstract transactionBody(): () => void;
  finalize(_: string): Promise<void> {
    return Promise.resolve();
  }
}

type Ctor<A extends LoadDescriptor> = new () => A;

let cmds: Command[] = [];
let registry = new Map<string, Ctor<any>>();

function register(name: string, load: Ctor<any>, command?: Command): void {
  registry.set(name, load);
  cmds.push((command ?? new Command()).name(name));
}

function load(name: string): LoadDescriptor {
  const desc = registry.get(name);
  if (desc === undefined) {
    throw `unknown load ${name}`;
  }
  return new desc();
}

function commands(): Command[] {
  return cmds;
}

export const LoadRegistry = {
  register,
  load,
  commands,
};
