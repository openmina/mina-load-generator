import {
  isReady,
  Mina,
  PrivateKey,
  shutdown,
  fetchAccount,
  PublicKey,
  AccountUpdate,
} from 'snarkyjs';
//import { Add } from './Add.js';
import { Command } from '@commander-js/extra-typings';
import { Logger } from 'tslog';
import { Account } from 'snarkyjs/dist/node/lib/mina/account.js';
import fetch from 'node-fetch';
import { setTimeout } from 'timers/promises';
// import { MultiAcc } from './MultiAcc.js';
import { SingleAcc } from './SingleAcc.js';
// import { Add } from './Add.js';

const log = new Logger();
const program = new Command();

async function fetchAcc(publicKey: PublicKey, url: string): Promise<Account> {
  let account = await fetchAccount({ publicKey }, url);
  if (account.account) {
    return account.account;
  } else {
    throw account.error;
  }
}

class ZkApp {
  url: string;
  key: PrivateKey;
  zk: SingleAcc;

  static async mk(key: PrivateKey, url: string): Promise<ZkApp> {
    log.debug('compiling zkapp...');
    await SingleAcc.compile();
    return new ZkApp(key, url);
  }

  constructor(key: PrivateKey, url: string) {
    this.key = key;
    this.url = url;
    this.zk = new SingleAcc(key.toPublicKey());
  }

  publicKey(): PublicKey {
    return this.key.toPublicKey();
  }

  async deploy(feePayer: PrivateKey): Promise<any> {
    log.debug('creating a deploy transaction...');
    let tx = await Mina.transaction(
      { fee: 1e9, sender: feePayer.toPublicKey() },
      () => {
        let update = AccountUpdate.fundNewAccount(feePayer.toPublicKey());
        update.send({ to: this.publicKey(), amount: 10e9 });
        this.zk.deploy();
      }
    );

    log.debug('generating a proof...');
    await tx.prove();

    log.debug('signing and sending the transaction...');
    let sentTx = await tx.sign([feePayer, this.key]).send();
    return sentTx;
  }

  async waitForFunding(): Promise<void> {
    await Mina.waitForFunding(this.publicKey().toBase58());
  }

  async call(feePayer: PrivateKey, nonce?: number): Promise<any> {
    log.debug('creating a transaction...');
    let tx = await Mina.transaction(
      { fee: 1e9, sender: feePayer.toPublicKey(), nonce },
      () => {
        this.zk.deposit();
      }
    );
    log.debug(`transaction: ${tx.toJSON()}`);

    try {
      log.debug('generating a proof...');
      await tx.prove();
      log.debug('signing and sending the transaction...');
      let sentTx = await tx.sign([feePayer, this.key]).send();
      return sentTx;
    } catch (e) {
      log.error(`error proving/singning/sending the transaction: ${e}`);
      throw e;
    }
  }
}

program
  .command('fetch')
  .requiredOption('-a, --address <public-key>', 'address to fetch')
  .requiredOption('-u, --url <url>', 'GraphQL endpoint')
  .action(async function (opts: { address: string; url: string }) {
    let publicKey: PublicKey;
    try {
      publicKey = PublicKey.fromBase58(opts.address);
    } catch (_e) {
      publicKey = PrivateKey.fromBase58(opts.address).toPublicKey();
    }

    let account = await fetchAcc(publicKey, opts.url);
    log.info(
      `publicKey: ${publicKey.toBase58()}\nbalance: ${
        account.balance
      }\nnonce: ${account.nonce}`
    );
  });

program
  .command('deploy')
  .option('-z, --zkapp-key <private-key>', 'zkApp address')
  .requiredOption(
    '-f, --fee-payer-key <private-key>',
    'sender of the zkApp invocation'
  )
  .requiredOption('-u, --url <url>', 'GraphQL endpoint')
  .option('-w, --wait', 'wait for zkApp to be included')
  .action(async function (opts: {
    zkappKey?: string;
    feePayerKey: string;
    wait?: boolean;
    url: string;
  }) {
    log.debug('activating Mina network connection...');
    const Network = Mina.Network(opts.url);
    Mina.setActiveInstance(Network);

    let zkappKey = opts.zkappKey
      ? PrivateKey.fromBase58(opts.zkappKey)
      : PrivateKey.random();
    log.debug(`publicKey: ${zkappKey.toPublicKey().toBase58()}`);
    log.debug(`privateKey: ${zkappKey.toBase58()}`);

    let zkapp = await ZkApp.mk(zkappKey, opts.url);

    let txSent = await zkapp.deploy(PrivateKey.fromBase58(opts.feePayerKey));
    if (txSent?.hash()) {
      log.info('transaction sent: %s', txSent.hash());
    }

    if (opts.wait) {
      log.debug('wait for funding...');
      await zkapp.waitForFunding();
    }
  });

program
  .command('call')
  .option('-z, --zkapp-key <private-key>', 'zkApp address')
  .requiredOption(
    '-f, --fee-payer-key <private-key>',
    'sender of the zkApp invocation'
  )
  // .requiredOption('-r, --receiver <public-key>', 'payoff receiver')
  .requiredOption('-u, --url <url>', 'GraphQL endpoint')
  .option('-c, --count <n>', 'count of zkApp transactions in sequence', '1')
  .option(
    '-p, --period <seconds>',
    'minimal period in seconds for sending transactions',
    '10'
  )
  .action(async function (opts: {
    zkappKey?: string;
    feePayerKey: string;
    // receiver: string;
    url: string;
    count: string;
    period: string;
  }) {
    log.debug('activating Mina network connection...');
    const Network = Mina.Network(opts.url);
    Mina.setActiveInstance(Network);

    let zkappKey: PrivateKey;
    if (opts.zkappKey) {
      zkappKey = PrivateKey.fromBase58(opts.zkappKey);
    } else {
      zkappKey = PrivateKey.random();
      log.debug('publicKey %s', zkappKey.toPublicKey().toBase58());
      log.debug('privateKey %s', zkappKey.toBase58());
    }

    let zkapp = await ZkApp.mk(zkappKey, opts.url);

    const sender = PrivateKey.fromBase58(opts.feePayerKey);

    if (!opts.zkappKey) {
      log.debug('deploying...');
      await zkapp.deploy(sender);
      log.debug('waiting for funding...');
      await zkapp.waitForFunding();
    }

    const account = await fetchAcc(sender.toPublicKey(), opts.url);
    let nonce = parseInt(account.nonce.toString());
    // let receiver = PublicKey.fromBase58(opts.receiver);
    for (let i = 0; i < parseInt(opts.count); i++) {
      let txSent = await zkapp.call(sender, nonce++); // TODO
      log.info(`transaction #${i} sent: ${txSent.hash()}`);
    }
  });

program
  .command('job')
  .option('-z, --zkapp-key <private-key>', 'zkApp address')
  .requiredOption('-c, --controller <url>', 'Job controller')
  .option('-c, --count <n>', 'count of zkApp transactions in sequence', '1')
  .action(async function (opts: {
    zkappKey?: string;
    controller: string;
    count: string;
  }) {
    let controller = opts.controller;
    if (controller.endsWith('/')) {
      controller = controller.substring(0, controller.length - 1);
    }
    const response = await fetch(`${controller}/init`);
    const config = (await response.json()) as { node: string; sender: string };

    const url = config.node;
    const feePayerKey = config.sender;
    const sender = PrivateKey.fromBase58(feePayerKey);
    log.info(
      `sending zkapps using ${sender.toPublicKey().toBase58()} via ${url}`
    );

    log.debug('activating Mina network connection...');
    const Network = Mina.Network(url);
    Mina.setActiveInstance(Network);

    let zkappKey: PrivateKey;
    if (opts.zkappKey) {
      zkappKey = PrivateKey.fromBase58(opts.zkappKey);
    } else {
      zkappKey = PrivateKey.random();
    }
    log.debug('using publicKey %s', zkappKey.toPublicKey().toBase58());

    let zkapp = await ZkApp.mk(zkappKey, url);

    if (!opts.zkappKey) {
      log.debug('deploying...');
      await zkapp.deploy(sender);
      log.debug('waiting for funding...');
      await zkapp.waitForFunding();
    }

    let ready = false;
    while (!ready) {
      const res = await fetch(
        `${controller}/ready/${zkappKey.toPublicKey().toBase58()}`,
        { method: 'head' }
      );
      ready = Boolean(res.headers.get('X-All-Ready'));
      if (!ready) {
        log.info('Other jobs are not ready yet. Waiting...');
        await setTimeout(5 * 1000);
      }
    }

    const account = await fetchAcc(sender.toPublicKey(), url);
    let nonce = parseInt(account.nonce.toString());
    // let receiver = PublicKey.fromBase58(config.receiver);
    for (let i = 0; i < parseInt(opts.count); i++) {
      let txSent = await zkapp.call(sender, nonce++);
      log.info(`transaction #${i} sent: ${txSent.hash()}`);
    }
  });

await isReady;
await program.parseAsync(process.argv);
shutdown();
