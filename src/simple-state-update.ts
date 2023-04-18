import { Command } from '@commander-js/extra-typings';
import { AccountUpdate, Mina, PrivateKey } from 'snarkyjs';
import { Logger } from 'tslog';
import { Add } from './Add.js';
import { LoadDescriptor, LoadRegistry, AbstractLoad } from './load-registry.js';
import { LOG } from './log.js';
//import { ControllerConfiguration } from "./controller.js";

export class SimpleStateUpdate extends AbstractLoad implements LoadDescriptor {
  account: PrivateKey;
  zk: Add;
  log: Logger<any>;

  constructor() {
    super();
    this.log = LOG.getSubLogger({ name: 'ssu' });
  }

  getCommand() {
    return new Command();
  }

  async deploy() {
    await Add.compile();
  }

  transactionBody() {
    return () => {
      this.zk.update();
    };
  }

  async initialize(account: PrivateKey) {
    this.account = PrivateKey.random();
    this.log.info(`public key: ${this.account.toPublicKey().toBase58()}`);
    this.log.debug(`private key: ${this.account.toBase58()}`);

    this.log.debug('compiling zkApp...');
    await Add.compile();
    this.log.debug('done');

    this.zk = new Add(this.account.toPublicKey());

    this.log.debug('deploying zkApp...');

    let tx = await Mina.transaction(
      { fee: 1e9, sender: account.toPublicKey() },
      () => {
        let update = AccountUpdate.fundNewAccount(account.toPublicKey());
        update.send({ to: this.account.toPublicKey(), amount: 10e9 });
        this.zk.deploy();
      }
    );

    this.log.debug('generating a proof...');
    await tx.prove();

    this.log.debug('signing and sending the transaction...');
    let sentTx = await tx.sign([account, this.account]).send();
    if (!sentTx.isSuccess) {
      this.log.error('error deploying zkApp');
      throw 'error deploying zkapp';
    }
    this.log.info('deploy transaction is sent: hash is ', sentTx.hash());

    this.log.debug('waiting for account to be funded...');
    await Mina.waitForFunding(this.account.toPublicKey().toBase58());
    this.log.info('zkapp is ready and deployed');

    return true;
  }
}

LoadRegistry.register('simple-state-update', SimpleStateUpdate);
