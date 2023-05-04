import { Command } from '@commander-js/extra-typings';
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

export const runCommand = new Command()
  .name('run')
  .description(
    'generate, send zkApp transactions and wait for them to be included in the chain'
  )
  .requiredOption(
    '-k, --keys <private-key...>',
    'private keys of existing accounts'
  )
  .option(
    '-n, --nodes <graphql-url...>',
    'graphql endpoints to access Mina nodes',
    ['http://localhost:3085/graphql']
  )
  .option(
    '-c, --count <number>',
    'count of transactions to send',
    myParseInt,
    1
  );

LoadRegistry.registerLoadCommand(
  runCommand,
  async ({ keys, nodes, count }, load) => {
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
  .requiredOption(
    '-k, --keys <private-key...>',
    'private keys of existing accounts'
  )
  .option(
    '-n, --nodes <graphql-url...>',
    'graphql endpoints to access Mina nodes',
    ['http://localhost:3085/graphql']
  )
  .option(
    '-o, --output <file>',
    'file to use for the transaction template',
    'zkapp-template.json'
  );

LoadRegistry.registerLoadCommand(
  generateCommand,
  async ({ keys, nodes, output }, load) => {
    const mina = new MinaBlockchainConnection(nodes);
    const accounts = new PrivateKeysSource(mina, keys);
    const txStore = new FileTransactionStore(output);

    const loadGen = new LoadGenerator(mina, accounts);

    await loadGen.generate(load, txStore);
  }
);

export const sendCommand = new Command()
  .name('send')
  .description('send generated zkApp transactions')
  .option(
    '-n, --nodes <graphql-url...>',
    'graphql endpoints to access Mina nodes',
    ['http://localhost:3085/graphql']
  )
  .option(
    '-c, --count <number>',
    'count of transactions to send',
    myParseInt,
    1
  )
  .option(
    '-i, --input <file>',
    'file to read transaction template from',
    'zkapp-template.json'
  )
  .option(
    '-o, --output <file>',
    'file store transaction IDs',
    'zkapp-tx-ids.json'
  )
  .action(async ({ nodes, input, count, output }) => {
    await isReady;

    const mina = new MinaBlockchainConnection(nodes);
    const accounts = new PrivateKeysSource(mina, []);
    const txStore = new FileTransactionStore(input);
    const idsStore = new FileTransactionIdsStore(output);
    const generator = new LoadGenerator(mina, accounts);

    await generator.sendAll(txStore, idsStore, { count });
    await idsStore.store();

    await shutdown();
  });

export const waitCommand = new Command()
  .name('wait')
  .description('wait for zkApp transaction to be included')
  .option(
    '-n, --nodes <graphql-url...>',
    'graphql endpoints to access Mina nodes',
    ['http://localhost:3085/graphql']
  )
  .option(
    '-i, --input <file>',
    'file with transaction IDs',
    'zkapp-tx-ids.json'
  )
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
