import { Command, CommanderError, Option } from '@commander-js/extra-typings';
import { accountSource } from './accounts-source.js';
import { LoadGenerator } from './load-generator.js';
import { LoadRegistry } from './load-registry.js';
import { MinaBlockchainConnection } from './mina-connection.js';
import { myParseInt } from './parse-int.js';
import { transactionStore } from './transaction-store.js';
import {
  FileTransactionIdsStore,
  transactionIdsStore,
} from './transaction-ids-store.js';
import { isReady, shutdown } from 'snarkyjs';

import * as dotenv from 'dotenv';
import { nodesSource } from './nodes-source.js';

dotenv.config();

function defaultNodes() {
  return (process.env.GRAPHQL_ENDPOINTS || 'http://localhost:3085/graphql')
    .split(',')
    .map((s) => s.trim());
}

const nodesOption = () =>
  new Option(
    '-n, --nodes <graphql-url...>',
    'graphql endpoints to access Mina nodes'
  ).default(defaultNodes());

const keysOption = () =>
  new Option(
    '-k, --keys <private-key...>',
    'private keys of existing accounts'
  );

const countOption = () =>
  new Option('-c, --count <number>', 'count of transactions to send')
    .default(1)
    .argParser(myParseInt);

const infiniteOption = () =>
  new Option('--infinite', 'send transactions infinitely')
    .conflicts(['count'])
    .implies({ wait: false });

const periodOption = () =>
  new Option(
    '-p, --period <seconds>',
    'period in seconds for transactions to send'
  ).argParser(myParseInt);

const durationOption = () =>
  new Option(
    '-d, --duration <seconds>',
    'duration in seconds for transactions to send'
  )
    .argParser(myParseInt)
    .conflicts(['count', 'infinite']);

const noWaitOption = () =>
  new Option('--no-wait', 'do not wait for transactions to be included');

export const runCommand = new Command()
  .name('run')
  .description(
    'generate, send zkApp transactions and wait for them to be included in the chain'
  )
  .addOption(keysOption())
  .addOption(nodesOption())
  .addOption(countOption())
  .addOption(durationOption())
  .addOption(infiniteOption())
  .addOption(periodOption())
  .addOption(noWaitOption());

LoadRegistry.registerLoadCommand(runCommand, async (opts, load, _name) => {
  const { keys, nodes, count, duration, infinite, period, wait } = opts;
  const accounts = accountSource(keys);
  const txStore = transactionStore();
  const idsStore = await transactionIdsStore();

  const mina = await MinaBlockchainConnection.create(nodesSource(nodes));

  const loadGen = new LoadGenerator(mina, accounts);

  await loadGen.generate(load, txStore);

  await loadGen.sendAll(txStore, idsStore, {
    count: infinite || duration ? undefined : count,
    duration,
    interval: period,
  });
  if (wait) {
    await loadGen.waitAll(idsStore, {});
  }
});

const remoteOption = new Option(
  '-r, --remote <url>',
  'remote server to store and fetch data'
).conflicts(['nodes', 'keys', 'input', 'output']);

const idOption = new Option(
  '--id <string>',
  'identity of this client for remote server'
);

export const generateCommand = new Command()
  .name('generate')
  .description('generate a zkApp transaction template')
  .addOption(keysOption())
  .addOption(nodesOption())
  .option('-o, --output <file>', 'file to use for the transaction template')
  .addOption(remoteOption)
  .addOption(idOption);

const TEMPLATE_SUFFIX = '-template.json';

LoadRegistry.registerLoadCommand(
  generateCommand,
  async ({ keys, nodes, output, remote, id }, load, name) => {
    const nodesSrc = nodesSource(nodes, remote, id);
    const accounts = accountSource(keys, remote, id);
    const out =
      remote === undefined ? output || name + TEMPLATE_SUFFIX : undefined;
    const txStore = transactionStore(out, remote, id);

    const mina = await MinaBlockchainConnection.create(nodesSrc);
    const loadGen = new LoadGenerator(mina, accounts);

    await loadGen.generate(load, txStore);
  }
);

const IDS_SUFFIX = '-ids.json';

export const sendCommand = new Command()
  .name('send')
  .description('send generated zkApp transactions')
  .addOption(nodesOption())
  .addOption(countOption())
  .option('-C, --continuous', 'send transactions continuously')
  .option(
    '-I, --interval <millis>',
    'interval in milliseconds for sending transactions',
    myParseInt
  )
  .option('-i, --input <file>', 'file to read transaction template from')
  .option('-o, --output <file>', 'file store transaction IDs')
  .addOption(remoteOption)
  .addOption(idOption)
  .action(
    async ({
      nodes,
      input,
      count,
      continuous,
      interval,
      output,
      remote,
      id,
    }) => {
      await isReady;

      const nodesSrc = nodesSource(nodes, remote, id);
      const accounts = accountSource([], remote, id);
      const txStore = transactionStore(input, remote, id);
      let out = output;
      if (
        out === undefined &&
        input !== undefined &&
        continuous === undefined
      ) {
        if (input.endsWith(TEMPLATE_SUFFIX)) {
          out =
            input.substring(0, input.length - TEMPLATE_SUFFIX.length) +
            IDS_SUFFIX;
        } else {
          throw new CommanderError(1, '', 'cannot calculate output parameter');
        }
      }
      const idsStore =
        continuous === undefined
          ? await transactionIdsStore(out, remote, id)
          : undefined;
      const mina = await MinaBlockchainConnection.create(nodesSrc);
      const generator = new LoadGenerator(mina, accounts);

      await generator.sendAll(txStore, idsStore, { count, interval });
      if (out !== undefined)
        await (idsStore as FileTransactionIdsStore).commit(out);

      await shutdown();
    }
  );

export const waitCommand = new Command()
  .name('wait')
  .description('wait for zkApp transaction to be included')
  .addOption(nodesOption())
  .option('-i, --input <file>', 'file with transaction IDs')
  .addOption(remoteOption)
  .addOption(idOption)
  .option(
    '-r, --retries <number>',
    'number of retries when waiting for a transaction',
    myParseInt
  )
  .option(
    '-a, --attempts <number>',
    'number of attempts to wait for a transaction, in each retry',
    myParseInt
  )
  .option(
    '-t, --timeout <seconds>',
    'timeout in seconds to wait for a transaction, in each attempt',
    myParseInt
  )
  .action(async ({ nodes, input, remote, id, retries, attempts, timeout }) => {
    await isReady;

    const nodesSrc = nodesSource(nodes, remote, id);
    const accounts = accountSource([], remote, id);
    const idsStore = await transactionIdsStore(input, remote, id);

    const mina = await MinaBlockchainConnection.create(nodesSrc);
    const generator = new LoadGenerator(mina, accounts);

    await generator.waitAll(idsStore, {
      waitMaxRetries: retries,
      waitAttempts: attempts,
      interval: timeout,
    });

    await shutdown();
  });
