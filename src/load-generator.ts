// import { Command } from '@commander-js/extra-typings';
import { Field, Mina, PrivateKey, PublicKey, UInt32 } from 'snarkyjs';
//import { ZkappCommand } from 'snarkyjs/dist/node/lib/account_update.js';
import { Logger } from 'tslog';
//import { LoadDescriptor, LoadRegistry } from './load-registry.js';
import { LOG } from './log.js';
import { TransactionId } from 'snarkyjs/dist/node/lib/mina.js';
import { TransactionTemplate } from './transaction.js';
import { AccountSource } from './accounts-source.js';
import { TransactionStore } from './transaction-store.js';
import { TransactionIdsStore } from './transaction-ids-store.js';
import { LoadDescriptor, TransactionBody } from './load-descriptor.js';
import { MinaConnection, retryWithConnection } from './mina-connection.js';
import { tracePerfAsync } from './perf.js';
import { setTimeout } from 'timers/promises';
import { isFetchError } from './fetch.js';

export interface SendConfig {
  /** count of transactions to be sent */
  readonly count?: number;

  /** duration in seconds during which transactions will be sent */
  readonly duration?: number;

  /** Specific period to use when sending transactions, in seconds.
   * If set, transactions will be sent using this period only after all of them are generated.
   * Otherwise, a transaction is sent as it is generated */
  readonly interval?: number;
}

const WAIT_MAX_RETRIES = 6;

export interface WaitConfig {
  // wait for a transaction: 20s * 30 attempts * 6 retries = 1h for each transaction.
  readonly waitMaxRetries?: number;

  // number of attempts to poll Mina for a transaction status
  readonly waitAttempts?: number;

  readonly interval?: number;
}

export class LoadGenerator {
  mina: MinaConnection;
  accounts: AccountSource;
  log: Logger<any>;
  nonce?: number;
  count: number = 1;

  constructor(mina: MinaConnection, accounts: AccountSource) {
    this.mina = mina;
    this.accounts = accounts;
    this.log = LOG.getSubLogger({ name: 'gen' });
  }

  async createProvenTransaction(
    sender: PublicKey,
    body: TransactionBody,
    fee: number | undefined
  ): Promise<Mina.Transaction> {
    this.log.trace('creating Mina transaction...');
    const tx = await Mina.transaction({ sender, fee }, body);
    await tracePerfAsync('transaction proof generation', this.log, tx.prove);
    this.log.silly('transaction:', tx.toPretty());
    return tx;
  }

  async createTransactionTemplate(
    account: PrivateKey,
    body: TransactionBody,
    fee: number | undefined,
    signers: PrivateKey[] | undefined
  ): Promise<TransactionTemplate> {
    const tx = await this.createProvenTransaction(
      account.toPublicKey(),
      body,
      fee
    );
    return TransactionTemplate.fromMina(tx, [...(signers || []), account]);
  }

  async generate(
    load: LoadDescriptor,
    txStore: TransactionStore
  ): Promise<void> {
    const account = await this.accounts.getPrivateKey();
    const publicKey = account.toPublicKey();
    await load.getSetupTransaction(publicKey).then(async (r) => {
      if (r === undefined) return;
      const { fee, body, signers } = r;
      const ttx = await this.createTransactionTemplate(
        account,
        body,
        fee,
        signers
      );
      await this.setup(ttx);
    });
    await load.getTransaction(publicKey).then(async (r) => {
      const { fee, body, signers } = r;
      const ttx = await this.createTransactionTemplate(
        account,
        body,
        fee,
        signers
      );
      await txStore.setTransaction(ttx);
    });
  }

  async setup(ttx: TransactionTemplate): Promise<void> {
    this.log.info('setting up transactions...');
    this.log.debug('sending setup transaction...');
    const id = await this.send(ttx);
    this.log.debug('waiting for setup transaction to be included...');
    await this.wait(id, {});
    this.log.info('transactions setup is completed');
  }

  async send(
    ttx: TransactionTemplate,
    nonce?: number | UInt32 | Field
  ): Promise<TransactionId> {
    const tx = ttx.getSigned(nonce);
    const id = await retryWithConnection(this.mina, async () => {
      const id = await tx.send();
      if (id.isSuccess) {
        return id;
      }
      const error = (id as any).error;
      if (isFetchError(error)) {
        throw error;
      } else {
        this.log.error(`error returned from send: ${error}`);
        return id;
      }
    });
    if (!id.isSuccess) {
      throw new Error(`failed to send a transaction`, {
        cause: (id as any).error,
      });
    }
    return id;
  }

  async account(publicKey: PublicKey) {
    while (true) {
      for (let i = 0; i < 6; i++) {
        try {
          return await this.mina.getAccount(publicKey);
        } catch (e) {
          this.log.warn(`cannot fetch account ${publicKey.toBase58()}: ${e}`);
          this.log.debug('retrying in 5s...');
          setTimeout(5 * 1000);
        }
      }
      try {
        this.mina.nextNode();
      } catch (cause) {
        throw new Error('cannot fetch account', { cause });
      }
    }
  }

  async wait(id: TransactionId, config: WaitConfig): Promise<void> {
    let retry = 0;
    while (1) {
      try {
        await id.wait({
          maxAttempts: config.waitAttempts,
          interval: config.interval,
        });
        return;
      } catch (e) {
        if (retry < (config.waitMaxRetries || WAIT_MAX_RETRIES)) {
          this.log.warn(`attempt #${retry} failed, retrying...`);
          this.log.trace(`error:`, e);
          this.mina.nextNode();
          // to avoid early exit on the next attempt
          id.isSuccess = true;
          retry++;
        } else {
          throw new Error(`failed to wait for tx ${id.hash()}`, { cause: e });
        }
      }
    }
  }

  async sendAll(
    txStore: TransactionStore,
    idsStore: TransactionIdsStore | undefined,
    { count, duration, interval }: SendConfig
  ): Promise<void> {
    const ttx = await txStore.getTransaction();
    const acc = await this.account(ttx.getFeePayer());
    let nonce = acc.nonce;
    let i = 0;
    let end =
      duration !== undefined
        ? setTimeout(duration * 1000, true)
        : new Promise(() => {});
    while (!count || i < count) {
      let wait = setTimeout((interval || 0) * 1000, false);
      this.log.info(`sending tx #${i}...`);
      try {
        const id = await this.send(ttx, nonce);
        nonce = nonce.add(1);
        i++;
        if (idsStore !== undefined) await idsStore.addTransactionId(id);
        this.log.info(`tx #${i} is sent, hash is ${id.hash()}`);
      } catch (e) {
        this.log.error(`error sending transaction: ${e}`);
      }
      if (await Promise.any([wait, end])) {
        this.log.info(`duration timeout is reached`);
        break;
      }
    }
  }

  async waitAll(
    idsStore: TransactionIdsStore,
    config: WaitConfig
  ): Promise<void> {
    const ids = await idsStore.getTransactionIds();
    this.log.info(`waiting for ${ids.length} transactions...`);
    for (const id of ids) {
      this.log.info(`waiting for ${id.hash()}...`);
      await this.wait(id, config);
      this.log.info(`${id.hash()} is included`);
    }
  }
}

// export let jobCommand = new Command()
//     .name('job')
//     .argument('[server]', 'remote controller URL', 'http://localhost:3000')
//     .action(async (server) => {
//         const log = LOG;
//         log.info(`using controller ${server}`);
//         const controller = new RemoteControllerClient(server, log);
//         await run(controller);
//     });

// export let localCommand = new Command()
//     .name('local')
//     .requiredOption('-u, --url <graphql>', 'GraphQL address of a Mina node')
//     .requiredOption(
//         '-k, --key <private-key>',
//         'private key of the account that performs transfers'
//     )
//     .option('-c, --count <number>', 'count of transactions', myParseInt, 1);

// for (let command of LoadRegistry.commands()) {
//     command.action(async (opts: any, cmd) => {
//         let { key, url, count }: { key: string; url: string; count: number } =
//             cmd.optsWithGlobals();
//         const controller = new LocalController(key, url, cmd.name(), count, opts);
//         await run(controller);
//     });
//     localCommand.addCommand(command);
// }

// async function run(controller: Controller) {
//     await isReady;
//     const generator = new LoadGenerator();
//     await generator.runShell(controller);
// }
