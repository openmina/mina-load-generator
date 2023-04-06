import { Command } from '@commander-js/extra-typings';
import { PrivateKey } from 'snarkyjs';

export interface LoadDescriptor {
  getCommand(): Command;
  initialize(account: PrivateKey): Promise<void>;
  transactionBody(config: any): () => void;
}

let registry = new Map<string, LoadDescriptor>();

function register(name: string, load: LoadDescriptor): void {
  registry.set(name, load);
}

function get(name: string): LoadDescriptor {
  const desc = registry.get(name);
  if (desc === undefined) {
    throw `unknown load ${name}`;
  }
  return desc;
}

function getAll(): { name: string; desc: LoadDescriptor }[] {
  return Array.from(registry, ([name, desc]) => ({ name, desc }));
}

export const LoadRegistry = {
  register,
  get,
  getAll,
};
