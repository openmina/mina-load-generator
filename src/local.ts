import { Command, CommanderError, Option } from '@commander-js/extra-typings';
import { PrivateKeysSource } from './accounts-source.js';
import { LoadGenerator } from './load-generator.js';
import { LoadRegistry } from './load-registry.js';
import { MinaBlockchainConnection } from './mina-connection.js';
import { myParseInt } from './parse-int.js';
import {
  FileTransactionStore,
  LocalTransactionStore,
} from './transaction-store.js';
import {
  FileTransactionIdsStore,
  LocalTransactionIdsStore,
} from './transaction-ids-store.js';
import { isReady, shutdown } from 'snarkyjs';

import * as dotenv from 'dotenv';

dotenv.config();

function defaultNodes() {
  return (process.env.GRAPHQL_ENDPOINTS || 'http://localhost:3085/graphql')
    .split(',')
    .map((s) => s.trim());
}

const nodesOption = new Option(
  '-n, --nodes <graphql-url...>',
  'graphql endpoints to access Mina nodes'
).default(defaultNodes());
const keysOption = new Option(
  '-k, --keys <private-key...>',
  'private keys of existing accounts'
).makeOptionMandatory();
const countOption = new Option(
  '-c, --count <number>',
  'count of transactions to send'
)
  .preset(1)
  .argParser(myParseInt);

export const runCommand = new Command()
  .name('run')
  .description(
    'generate, send zkApp transactions and wait for them to be included in the chain'
  )
  .addOption(keysOption)
  .addOption(nodesOption)
  .addOption(countOption);

LoadRegistry.registerLoadCommand(
  runCommand,
  async ({ keys, nodes, count }, load, _name) => {
    const mina = new MinaBlockchainConnection(nodes);
    const accounts = new PrivateKeysSource(mina, keys);
    const txStore = new LocalTransactionStore();
    const idsStore = new LocalTransactionIdsStore();

    const loadGen = new LoadGenerator(mina, accounts);

    await loadGen.generate(load, txStore);
    await loadGen.sendAll(txStore, idsStore, { count });
    await loadGen.waitAll(idsStore, {});
  }
);

export const generateCommand = new Command()
  .name('generate')
  .description('generate a zkApp transaction template')
  .addOption(keysOption)
  .addOption(nodesOption)
  .option('-o, --output <file>', 'file to use for the transaction template');

const TEMPLATE_SUFFIX = '-template.json';

LoadRegistry.registerLoadCommand(
  generateCommand,
  async ({ keys, nodes, output }, load, name) => {
    const mina = new MinaBlockchainConnection(nodes);
    const accounts = new PrivateKeysSource(mina, keys);
    const txStore = new FileTransactionStore(output || name + TEMPLATE_SUFFIX);
    const loadGen = new LoadGenerator(mina, accounts);

    await loadGen.generate(load, txStore);
  }
);

const IDS_SUFFIX = '-ids.json';

export const sendCommand = new Command()
  .name('send')
  .description('send generated zkApp transactions')
  .addOption(nodesOption)
  .addOption(countOption)
  .requiredOption(
    '-i, --input <file>',
    'file to read transaction template from'
  )
  .option('-o, --output <file>', 'file store transaction IDs')
  .action(async ({ nodes, input, count, output }) => {
    await isReady;

    const mina = new MinaBlockchainConnection(nodes);
    const accounts = new PrivateKeysSource(mina, []);
    const txStore = new FileTransactionStore(input);
    let out = output;
    if (out === undefined) {
      if (input.endsWith(TEMPLATE_SUFFIX)) {
        out =
          input.substring(0, input.length - TEMPLATE_SUFFIX.length) +
          IDS_SUFFIX;
      } else {
        throw new CommanderError(1, '', 'cannot calculate output parameter');
      }
    }
    const idsStore = new FileTransactionIdsStore(out);
    const generator = new LoadGenerator(mina, accounts);

    await generator.sendAll(txStore, idsStore, { count });
    await idsStore.store();

    await shutdown();
  });

export const waitCommand = new Command()
  .name('wait')
  .description('wait for zkApp transaction to be included')
  .addOption(nodesOption)
  .requiredOption('-i, --input <file>', 'file with transaction IDs')
  .action(async ({ nodes, input }) => {
    await isReady;

    const mina = new MinaBlockchainConnection(nodes);
    const accounts = new PrivateKeysSource(mina, []);
    const idsStore = new FileTransactionIdsStore(input);
    const generator = new LoadGenerator(mina, accounts);

    await idsStore.load();
    await generator.waitAll(idsStore, {});

    await shutdown();
  });
