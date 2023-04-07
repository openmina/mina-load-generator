import { Command } from '@commander-js/extra-typings';
import {
  AccountUpdate,
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
import { RemoteControllerClient } from './controller.js';
import { Controller } from './controller.js';
import { LoadDescriptor, LoadRegistry } from './load-registry.js';
import { myParseInt } from './parse-int.js';
import './multi-account-transfer.js';
import './multi-account-proofs.js';
import './multi-account-proofs-sigs.js';
import './simple-state-update.js';
import { LocalBlockchain } from 'snarkyjs/dist/node/lib/mina.js';
import { LOG } from './log.js';

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

  constructor(
    controller: Controller,
    account: PrivateKey,
    url: string,
    name: string,
    load: LoadDescriptor,
    log: Logger<any>
  ) {
    this.controller = controller;
    this.account = account;
    this.url = url;
    this.name = name;
    this.load = load;
    this.log = log.getSubLogger({ name: 'load-gen' });
  }

  async run() {
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
    this.log.debug(`account is ${this.accountData}`);

    let work;
    while ((work = await this.getMoreWork()) !== undefined) {
      this.log.debug('work received: ${work}');
      await this.doWork(work);
    }
    this.log.debug('no more work');
  }

  async initialize(): Promise<void> {
    await this.load.initialize(this.account);
  }

  async fetchAccount() {
    // const result = await fetchAccount(
    //   { publicKey: this.publicKey() },
    //   this.url
    // );
    // if (result.account) {
    //   //this.log.trace('account fetched: ', result.account);
    //   this.accountData = result.account;
    //   this.nonce = parseInt(this.accountData.nonce.toString());
    //   return true;
    // } else {
    //   this.log.error('error fetching account:', result.error);
    //   return false;
    // }
    return true;
  }

  async getMoreWork(): Promise<void> {
    return this.controller.getMoreWork();
  }

  async doWork(_work: any): Promise<void> {
    this.log.silly('preparing transaction...');
    let body = this.load.transactionBody();
    let tx = await Mina.transaction(
      { fee: UInt64.from(100e9), sender: this.publicKey() },
      body
    );
    //this.log.silly('transaction:', tx);

    try {
      this.log.silly('generating a proof...');
      await tx.prove();
      this.log.silly('proof is generated');

      this.log.silly('signing and sending the transaction...');
      let sentTx = await tx.sign([this.privateKey()]).send();
      //this.log.silly('sentTx', sentTx);
      if (sentTx.isSuccess) {
        this.log.info('tx hash:', sentTx.hash());
        this.log.info('waiting for it to be in block...');
        await sentTx.wait();
        this.log.info('transaction is in block');
      } else {
        for (let error of (sentTx as any).errors) {
          this.log.error('error sending transaction:', error);
        }
      }
    } catch (e) {
      this.log.error('error proving/signing/sending the transaction', e);
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
  .argument('<server>', 'remote controller URL')
  .action(async (server) => {
    const log = LOG;
    log.info(`using controller ${server}`);
    const controller = new RemoteControllerClient(server, log);
    await run(controller);
  });

class LocalController {
  account: string;
  graphql: string;
  name: string;
  count: number;
  data: any;

  constructor(
    account: string,
    graphql: string,
    name: string,
    count: number,
    data: any
  ) {
    this.account = account;
    this.graphql = graphql;
    this.name = name;
    this.count = count;
    this.data = data;
  }

  getJobConfiguration(): Promise<any> {
    return Promise.resolve({
      account: this.account,
      graphql: this.graphql,
      name: this.name,
      data: this.data,
    });
  }
  notifyReadyAndWaitForOthers(_key: any): Promise<void> {
    return Promise.resolve();
  }
  getMoreWork(): Promise<any> {
    if (this.count-- <= 0) {
      return Promise.resolve(undefined);
    } else {
      return Promise.resolve({});
    }
  }
}

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
  const config = (await controller.getJobConfiguration()) as any;

  const { account: acc, graphql, name, data } = config;
  let load = LoadRegistry.load(name);
  const account = PrivateKey.fromBase58(acc);
  const generator = new LoadGenerator(
    controller,
    account,
    graphql,
    name,
    load,
    LOG
  );
  await generator.run();

  await shutdown();
}
