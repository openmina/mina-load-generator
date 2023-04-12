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
import { LocalController, RemoteControllerClient } from './controller.js';
import { Controller } from './controller.js';
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

  async run(controller: Controller) {
    this.controller = controller;
    // let data: any;

    const config = await controller.getJobConfiguration();
    if (config === undefined) {
      this.log.warn('no configuration is return, stopping');
      return;
    }
    ({ account: this.account, graphql: this.url, name: this.name } = config);
    this.load = LoadRegistry.load(this.name);

    this.log.debug(`activating Mina connection to ${this.url}...`);
    //let local = Mina.LocalBlockchain();
    //Mina.setActiveInstance(local);
    //this.account = local.testAccounts[0].privateKey;
    Mina.setActiveInstance(Mina.Network(this.url));

    this.log.debug('initializing...');
    await this.initialize();
    this.log.debug('initialized');

    this.log.debug('notifying readiness...');
    await this.controller.notifyReadyAndWaitForOthers(this.publicKeyStr());
    this.log.debug('ready for work');

    this.log.debug("fetching sender's account...");
    if (!(await this.fetchAccount())) {
      return;
    }
    this.log.debug('account is fetched');
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

    await controller.notifyDoneAndWaitForOthers(this.publicKeyStr());
  }

  async initialize(): Promise<void> {
    await this.load.initialize(this.account);
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
    this.log.silly('preparing transaction...');
    let body = this.load.transactionBody();
    let tx = await Mina.transaction(
      {
        fee: UInt64.from(100e9),
        sender: this.publicKey(),
        nonce: this.nonce++,
      },
      body
    );
    //this.log.silly('transaction:', tx);

    try {
      this.log.silly('generating a proof...');
      await tx.prove();
      this.log.silly('proof is generated');

      this.log.silly('signing and sending the transaction...');
      return tx.sign([this.privateKey()]);
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
  await generator.run(controller);
  await shutdown();
}
