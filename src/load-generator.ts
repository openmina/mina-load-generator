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

  constructor() {
    this.log = LOG.getSubLogger({ name: 'load-gen' });
  }

  async runShell(controller: Controller): Promise<void> {
    let code: number = 0;
    try {
      if (!(await this.run(controller))) {
        this.log.warn(
          'job failed to initialize, should be restarted with different configuration'
        );
        code = 22;
      }
    } catch (e) {
      this.log.error('job failed to run:', e);
      code = 1;
    }
    await shutdown();
    process.exit(code);
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

    this.log.silly(`account is ${this.accountData}`);
    let txs = [];

    while (await this.hasMoreWork()) {
      this.log.debug('has more work');
      let tx = await this.doWork();
      if (tx != undefined) txs.push(tx);
    }
    this.log.debug('no more work');

    this.log.info(`sending ${txs.length} transactions...`);
    let ids = [];
    for (let tx of txs) {
      let id = await tx.send();
      if (id.isSuccess) {
        this.log.info(`sent ${id.hash()}`);
        ids.push(id);
      } else {
        this.log.error('error sending transaction:', (id as any).errors);
      }
      await setTimeout(10 * 1000);
    }

    this.log.info(
      `waiting for ${ids.length} transactions to be in the chain...`
    );
    await Promise.all(
      ids.map((id) =>
        id
          .wait({ maxAttempts: 720 }) // 4 hours
          .then(() => this.log.debug(`${id.hash()} included`))
      )
    );
    this.log.info('all transactions are included');

    await this.load.finalize(this.url);

    await controller.notifyDoneAndWaitForOthers(this.publicKeyStr());

    return true;
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

  async doWork(): Promise<Mina.Transaction | undefined> {
    this.log.trace('preparing transaction...');
    let body = this.load.transactionBody();
    let signers = this.load.signers ? [...this.load.signers] : [];
    signers.push(this.privateKey());
    this.log.debug(
      'signers: ',
      signers.map((k) => k.toBase58())
    );
    let tx = await Mina.transaction(
      {
        fee: UInt64.from(100e9),
        sender: this.publicKey(),
        nonce: this.nonce++,
      },
      body
    );
    this.log.trace('transaction:', tx.toPretty());

    try {
      this.log.trace('generating a proof...');
      await tx.prove();
      this.log.trace('proof is generated');

      this.log.trace('signing and sending the transaction...');
      return tx.sign(signers);
      // await writeFile("transaction.json", tx.toJSON());
      // await writeFile("transaction.graphql", tx.toGraphqlQuery());
    } catch (e) {
      this.log.error('error proving/signing/sending the transaction', e);
      return;
    }
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
