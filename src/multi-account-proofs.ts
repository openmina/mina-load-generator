import { Command } from '@commander-js/extra-typings';
import { AccountUpdate, Mina, PrivateKey, PublicKey, UInt64 } from 'snarkyjs';
import { Logger } from 'tslog';
import { LoadDescriptor, LoadRegistry } from './load-registry.js';
import { LOG } from './log.js';
import { MultiAcc } from './MultiAcc.js';
import { myParseInt } from './parse-int.js';

export interface Transfer {
  to: PublicKey;
  amount: number;
}

class MultiAccTrans implements LoadDescriptor {
  signer: PrivateKey;
  account: PrivateKey;
  zk: MultiAcc;
  recepients: PublicKey[];
  log: Logger<any>;
  a1: PublicKey;
  a2: PublicKey;

  constructor() {
    this.log = LOG.getSubLogger({ name: 'matp' });
  }

  getCommand() {
    return new Command();
  }

  async initialize(account: PrivateKey) {
    this.signer = account;
    this.account = PrivateKey.random();
    this.recepients = Array.from({ length: 8 }, (_) =>
      PrivateKey.random().toPublicKey()
    );
    this.log.info(`public key: ${this.account.toPublicKey().toBase58()}`);
    this.log.debug(`private key: ${this.account.toBase58()}`);

    // this.a1 = PrivateKey.random().toPublicKey();
    // this.a2 = PrivateKey.random().toPublicKey();
    this.a1 = PublicKey.fromBase58(
      'B62qp8iy2kUcn7hJgEaDPdrRXE4KQ59vz6shpUT4cmrhhKUDvvrkKZL'
    );
    this.a2 = PublicKey.fromBase58(
      'B62qpPita1s7Dbnr7MVb3UK8fdssZixL1a4536aeMYxbTJEtRGGyS8U'
    );

    this.log.debug('compiling zkApp...');
    await MultiAcc.compile();
    this.log.debug('done');

    this.zk = new MultiAcc(this.account.toPublicKey());

    this.log.debug('deploying zkApp...');

    let tx = await Mina.transaction(
      { fee: 1e9, sender: account.toPublicKey() },
      () => {
        let update = AccountUpdate.fundNewAccount(account.toPublicKey());
        update.send({ to: this.account.toPublicKey(), amount: 100e9 });
        this.zk.deploy();
        // AccountUpdate.fundNewAccount(account.toPublicKey()).send({to: this.a1, amount: 100e9});
        // AccountUpdate.fundNewAccount(account.toPublicKey()).send({to: this.a2, amount: 100e9});
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

    this.log.debug('waiting for account to be founded...');
    await sentTx.wait();
    this.log.info('zkapp is ready and deployed');
  }

  transactionBody() {
    return () => {
      this.zk.deposit(UInt64.from(100e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
      this.zk.transfer(UInt64.from(10e9), this.a2);
    };
  }
}

LoadRegistry.register('multi-account-proofs', MultiAccTrans);
