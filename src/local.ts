import { Command } from '@commander-js/extra-typings';
import { PrivateKeysSource } from './accounts-source.js';
import { LoadGenerator } from './load-generator.js';
import { LoadRegistry } from './load-registry.js';
import { MinaBlockchainConnection } from './mina-connection.js';
import { myParseInt } from './parse-int.js';
import { LocalTransactionStore } from './transaction-store.js';
import { LocalTransactionIdsStore } from './transaction-ids-store.js';

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

LoadRegistry.registerLoadCommand(runCommand, async (opts, load) => {
  const { keys, nodes, count } = opts;
  const mina = new MinaBlockchainConnection(nodes);
  const accounts = new PrivateKeysSource(mina, keys);
  const txStore = new LocalTransactionStore();
  const idsStore = new LocalTransactionIdsStore();

  const loadGen = new LoadGenerator(mina, accounts, txStore, idsStore, load);

  await loadGen.generate();
  await loadGen.sendAll({ count });
  await loadGen.waitAll({});
});

// TODO
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
  .option('-o, --output <file>', 'file to use for the transaction template');

// LoadRegistry.registerLoadCommand(generateCommand, async ({ keys, nodes, output }, load) => {
//     const mina = new MinaBlockchainConnection(nodes);
//     const accounts = new PrivateKeysSource(mina, keys);
//     const txStore = new FileTransactionStore(output);

//     const loadGen = new LoadGenerator(mina, accounts, txStore, load);

//     await loadGen.generate();
// });
