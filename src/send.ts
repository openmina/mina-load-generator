import {
  isReady,
  Mina,
  PrivateKey,
  shutdown,
  fetchAccount,
  PublicKey,
  AccountUpdate,
} from 'snarkyjs';
import { Add } from './Add.js';
import { Command } from '@commander-js/extra-typings';
import { Logger } from 'tslog';
import { Account } from 'snarkyjs/dist/node/lib/fetch.js';
import fetch from 'node-fetch';

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
  zk: Add;

  constructor(key: PrivateKey, url: string) {
    this.key = key;
    this.url = url;
    this.zk = new Add(key.toPublicKey());
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
        this.zk.update();
      }
    );

    log.debug('generating a proof...');
    await tx.prove();

    log.debug('signing and sending the transaction...');
    let sentTx = await tx.sign([feePayer]).send();
    return sentTx;
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

    let zkapp = new ZkApp(zkappKey, opts.url);

    let txSent = await zkapp.deploy(PrivateKey.fromBase58(opts.feePayerKey));
    if (txSent.hash()) {
      log.info('transaction sent: %s', txSent.hash());
    } else {
      throw txSent;
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
    }
    log.debug('using publicKey %s', zkappKey.toPublicKey().toBase58());

    log.debug('compiling smart contract...');
    Add.compile();
    let zkapp = new ZkApp(zkappKey, opts.url);

    const sender = PrivateKey.fromBase58(opts.feePayerKey);

    if (!opts.zkappKey) {
      log.debug('deploying...');
      await zkapp.deploy(sender);
      log.debug('waiting for funding...');
      await zkapp.waitForFunding();
    }

    const account = await fetchAcc(sender.toPublicKey(), opts.url);
    let nonce = parseInt(account.nonce.toString());
    for (let i = 0; i < parseInt(opts.count); i++) {
      let txSent = await zkapp.call(sender, nonce++);
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
    const response = await fetch(opts.controller);
    const config: any = await response.json();

    const url = config.node;
    const feePayerKey = config.sender;
    const sender = PrivateKey.fromBase58(feePayerKey);
    log.info(`sending zkapps using ${sender.toPublicKey()} via ${url}`);

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

    log.debug('compiling smart contract...');
    Add.compile();
    let zkapp = new ZkApp(zkappKey, url);

    if (!opts.zkappKey) {
      log.debug('deploying...');
      await zkapp.deploy(sender);
      log.debug('waiting for funding...');
      await zkapp.waitForFunding();
    }

    const account = await fetchAcc(sender.toPublicKey(), url);
    let nonce = parseInt(account.nonce.toString());
    for (let i = 0; i < parseInt(opts.count); i++) {
      let txSent = await zkapp.call(sender, nonce++);
      log.info(`transaction #${i} sent: ${txSent.hash()}`);
    }
  });

await isReady;
await program.parseAsync(process.argv);
shutdown();
