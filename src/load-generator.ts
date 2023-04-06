import { Command } from '@commander-js/extra-typings';
import {
  AccountUpdate,
  fetchAccount,
  isReady,
  Mina,
  PrivateKey,
  PublicKey,
  shutdown,
} from 'snarkyjs';
import { Account } from 'snarkyjs/dist/node/lib/mina/account.js';
import { Logger } from 'tslog';
import { RemoteControllerClient } from './controller.js';
import { Controller } from './controller.js';
import { LoadRegistry } from './load-registry.js';
import { myParseInt } from './parse-int.js';
import './multi-account-transfer.js';
import './simple-state-update.js';

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
  data: any;
  log: Logger<any>;

  constructor(
    controller: Controller,
    account: PrivateKey,
    url: string,
    name: string,
    data: any,
    log: Logger<any>
  ) {
    this.controller = controller;
    this.account = account;
    this.url = url;
    this.name = name;
    this.data = data;
    this.log = log.getSubLogger({ name: 'load-gen' });
  }

  async run() {
    this.log.debug(`activating Mina connection to ${this.url}...`);
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
    await LoadRegistry.get(this.name).initialize(this.account);
  }

  async fetchAccount() {
    const result = await fetchAccount(
      { publicKey: this.publicKey() },
      this.url
    );
    if (result.account) {
      this.log.trace('account fetched: ', result.account);
      this.accountData = result.account;
      this.nonce = parseInt(this.accountData.nonce.toString());
      return true;
    } else {
      this.log.error('error fetching account:', result.error);
      return false;
    }
  }

  async getMoreWork(): Promise<void> {
    return this.controller.getMoreWork();
  }

  async doWork(_work: any): Promise<void> {
    this.log.silly('preparing transaction...');
    let load = LoadRegistry.get(this.name);
    let body = load.transactionBody(this.data);
    let tx = await Mina.transaction(
      { fee: 1e9, sender: this.publicKey(), nonce: this.nonce++ },
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

let controller: Controller | undefined;
let localConfig: any | undefined = undefined;

let job = new Command()
  .name('job')
  .argument('<server>', 'remote controller URL')
  .action((server) => {
    const log = new Logger();
    log.info(`using controller ${server}`);
    controller = new RemoteControllerClient(server, log);
  });

let local = new Command()
  .name('local')
  .requiredOption('-u, --url <graphql>', 'GraphQL address of a Mina node')
  .requiredOption(
    '-k, --key <private-key>',
    'private key of the account that performs transfers'
  )
  .option('-c, --count <number>', 'count of transactions', myParseInt, 1)
  .hook('postAction', (cmd, sub) => {
    const opts = cmd.opts();
    const data = localConfig;
    class C implements Controller {
      getJobConfiguration(): Promise<any> {
        return Promise.resolve({
          account: opts.key,
          graphql: opts.url,
          name: sub.name(),
          data,
        });
      }
      notifyReadyAndWaitForOthers(_key: any): Promise<void> {
        return Promise.resolve();
      }
      getMoreWork(): Promise<any> {
        if (opts.count-- <= 0) {
          return Promise.resolve(undefined);
        } else {
          return Promise.resolve({});
        }
      }
    }
    controller = new C();
  });

for (let { name, desc } of LoadRegistry.getAll()) {
  let command = desc.getCommand();
  command.name(name).action((opts: any) => {
    localConfig = opts;
  });
  local.addCommand(command);
}

const program = new Command()
  .option(
    '-v, --verbose',
    'make more logging',
    (_, prev) => (prev > 0 ? prev - 1 : prev),
    3
  )
  .addCommand(job)
  .addCommand(local);

await isReady;
program.parse(process.argv);
if (controller === undefined) {
  process.exit(1);
}
const log = new Logger({ minLevel: program.opts().verbose as number });

const config = (await controller.getJobConfiguration()) as any;
const { account: acc, graphql, name, data } = config;
const account = PrivateKey.fromBase58(acc);
const generator = new LoadGenerator(
  controller,
  account,
  graphql,
  name,
  data,
  log
);
await generator.run();

await shutdown();
