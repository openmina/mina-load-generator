import { Command } from '@commander-js/extra-typings';
import {
  fetchAccount,
  isReady,
  Mina,
  PrivateKey,
  PublicKey,
  shutdown,
  UInt64,
} from 'snarkyjs';
import { Account } from 'snarkyjs/dist/node/lib/mina/account.js';
//import { ZkappCommand } from 'snarkyjs/dist/node/lib/account_update.js';
import { Logger } from 'tslog';
import {
  Controller,
  LocalController,
  RemoteControllerClient,
} from './controller.js';
import { LoadDescriptor, LoadRegistry } from './load-registry.js';
import { myParseInt } from './parse-int.js';
import { LOG } from './log.js';
import { setTimeout } from 'timers/promises';
import { TransactionId } from 'snarkyjs/dist/node/lib/mina.js';
import { Transaction } from './transaction.js';

export interface Load {
  prepare(): Promise<void>;
  transactionBody(): () => void;
}

export class LoadGenerator {
  controller: Controller;
  account: PrivateKey;
  accountData: Account;
  nonce: number;
  url: string;
  name: string;
  load: LoadDescriptor;
  log: Logger<any>;

  /** Specific period to use when sending transactions, in seconds.
   * If set, transactions will be sent using this period only after all of them are generated.
   * Otherwise, a transaction is sent as it is generated */
  txSendPeriod: number | undefined;

  // wait for a transaction: 20s * 30 attempts * 6 retries = 1h for each transaction.
  waitMaxRetries: number = 6;
  waitAttempts: number = 30;
  txTempl: Mina.Transaction;

  constructor() {
    this.log = LOG.getSubLogger({ name: 'load-gen' });
  }

  async runShell(controller: Controller): Promise<void> {
    try {
      if (!(await this.run(controller))) {
        this.log.warn(
          'job failed to initialize, should be restarted with different configuration'
        );
        process.exit(22);
      }
    } catch (e) {
      this.log.error('job failed to run:', e);
      process.exit(125);
    }
    await shutdown();
  }

  async run(controller: Controller): Promise<boolean> {
    this.controller = controller;
    // let data: any;

    const config = await controller.getJobConfiguration();
    this.account = PrivateKey.fromBase58(config.account);
    this.url = config.graphql;
    this.name = config.name;

    try {
      this.log.info(
        `initializing worker with account ${this.account
          .toPublicKey()
          .toBase58()} and graphql ${this.url}`
      );
      this.load = LoadRegistry.load(this.name);

      this.log.debug(`activating Mina connection to ${this.url}...`);
      Mina.setActiveInstance(Mina.Network(this.url));

      this.log.debug('initializing...');
      if (!(await this.load.initialize(this.account))) {
        this.log.error('error initializing the load');
        return false;
      }
      this.log.debug("fetching sender's account...");
      if (!(await this.fetchAccount())) {
        this.log.error('cannot fetch account');
        return false;
      }
      this.log.debug('account is fetched');

      this.log.info('initialized');
    } catch (e) {
      this.log.error('failed to initialize worker:', e);
      return false;
    }

    this.log.debug('notifying readiness...');
    await this.controller.notifyReadyAndWaitForOthers(this.publicKeyStr());
    this.log.debug('ready for work');

    let trans = await this.prepareTransaction();

    let txs = [];
    let ids = [];

    while (await this.hasMoreWork()) {
      this.log.debug('has more work');
      let tx = await this.doWork(trans);
      if (tx == undefined) {
        this.log.warn('failed to generate a transaction');
        continue;
      }
      if (this.txSendPeriod == undefined) {
        const id = await this.sendTransaction(tx);
        if (id !== undefined) ids.push(id);
      } else {
        txs.push(tx);
      }
    }
    this.log.debug('no more work');

    await this.sendTransactions(txs, ids);
    await this.waitForTransactions(ids);

    await this.load.finalize(this.url);

    await controller.notifyDoneAndWaitForOthers(this.publicKeyStr());

    return true;
  }

  async sendTransactions(txs: Mina.Transaction[], ids: TransactionId[]) {
    if (txs.length === 0 || this.txSendPeriod === undefined) {
      return;
    }
    this.log.info(`sending ${txs.length} transactions...`);
    for (let tx of txs) {
      const timer = setTimeout(this.txSendPeriod * 1000);
      const id = await this.sendTransaction(tx);
      if (id !== undefined) {
        ids.push(id);
        await timer;
      }
    }
    this.log.info('all transactions are sent');
  }

  async sendTransaction(
    tx: Mina.Transaction
  ): Promise<TransactionId | undefined> {
    let id = await tx.send();
    if (id.isSuccess) {
      this.log.info(`sent ${id.hash()}`);
      return id;
    } else {
      this.log.error('error sending transaction:', (id as any).errors);
      return undefined;
    }
  }

  async waitForTransactions(ids: TransactionId[]): Promise<void> {
    this.log.info(
      `waiting for ${ids.length} transactions to be in the chain...`
    );
    for (const id of ids) {
      await this.waitForTransaction(id);
    }
    this.log.info('all transactions are included');
  }

  async waitForTransaction(id: TransactionId): Promise<void> {
    this.log.debug(
      `waiting for transaction ${id.hash()} to be in the chain...`
    );
    let retry = 0;
    while (retry < this.waitMaxRetries) {
      try {
        await id.wait({ maxAttempts: this.waitAttempts });
        this.log.info(`transaction ${id.hash()} included into the chain`);
        return;
      } catch (e) {
        this.log.warn(`error waiting for the transaction ${id.hash()}:`, e);
        retry++;
      }
    }
    throw Error(`failed to wait for transaction ${id.hash()} to be included`);
  }

  async fetchAccount() {
    const result = await fetchAccount(
      { publicKey: this.publicKey() },
      this.url
    );
    if (result.account) {
      //this.log.trace('account fetched: ', result.account);
      this.accountData = result.account;
      this.nonce = parseInt(this.accountData.nonce.toString());
      return true;
    } else {
      this.log.error('error fetching account:', result.error);
      return false;
    }
    //return true;
  }

  async hasMoreWork(): Promise<boolean> {
    return this.controller.hasMoreWork();
  }

  async doWork(trans: Transaction): Promise<Mina.Transaction | undefined> {
    const tx = trans.create(this.nonce++);
    let signers = this.load.signers ? [...this.load.signers] : [];
    signers.push(this.privateKey());
    this.log.debug(
      'signers: ',
      signers.map((k) => k.toBase58())
    );

    try {
      this.log.trace('signing the transaction...');
      let signed = tx.sign(signers);
      this.log.trace('transaction:', signed.toPretty());
      return signed;
    } catch (e) {
      this.log.error('error signing the transaction', e);
      return;
    }
  }

  async prepareTransaction(): Promise<Transaction> {
    this.log.info('preparing transaction...');
    let body = this.load.transactionBody();
    let tx = await Mina.transaction(
      {
        fee: UInt64.from(100e9),
        sender: this.publicKey(),
      },
      body
    );
    this.log.trace('transaction:', tx.toPretty());

    try {
      this.log.trace('generating a proof...');
      await tx.prove();
      this.log.trace('proof is generated');
    } catch (e) {
      this.log.error('error proving the transaction', e);
      throw e;
    }
    return new Transaction(tx);
  }

  privateKey(): PrivateKey {
    return this.account;
  }

  privateKeyStr(): string {
    return this.privateKey().toBase58();
  }

  publicKey(): PublicKey {
    return this.account.toPublicKey();
  }

  publicKeyStr(): string {
    return this.publicKey().toBase58();
  }
}

export let jobCommand = new Command()
  .name('job')
  .argument('[server]', 'remote controller URL', 'http://localhost:3000')
  .action(async (server) => {
    const log = LOG;
    log.info(`using controller ${server}`);
    const controller = new RemoteControllerClient(server, log);
    await run(controller);
  });

export let localCommand = new Command()
  .name('local')
  .requiredOption('-u, --url <graphql>', 'GraphQL address of a Mina node')
  .requiredOption(
    '-k, --key <private-key>',
    'private key of the account that performs transfers'
  )
  .option('-c, --count <number>', 'count of transactions', myParseInt, 1);

for (let command of LoadRegistry.commands()) {
  command.action(async (opts: any, cmd) => {
    let { key, url, count }: { key: string; url: string; count: number } =
      cmd.optsWithGlobals();
    const controller = new LocalController(key, url, cmd.name(), count, opts);
    await run(controller);
  });
  localCommand.addCommand(command);
}

async function run(controller: Controller) {
  await isReady;
  const generator = new LoadGenerator();
  await generator.runShell(controller);
}
