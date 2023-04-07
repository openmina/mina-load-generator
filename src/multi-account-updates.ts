import { Command } from '@commander-js/extra-typings';
import { AccountUpdate, Mina, PrivateKey, PublicKey, UInt64 } from 'snarkyjs';
import { Logger } from 'tslog';
import { LoadDescriptor, LoadRegistry } from './load-registry.js';
import { LOG } from './log.js';
import { MultiAcc } from './MultiAcc.js';

export interface Transfer {
  to: PublicKey;
  amount: number;
}

abstract class MultiAccTrans {
  log: Logger<any>;
  sender: PrivateKey;
  a1: PublicKey;
  a2: PublicKey;
  a3: PublicKey;
  a4: PublicKey;
  a5: PublicKey;
  a6: PublicKey;
  a7: PublicKey;
  a8: PublicKey;

  constructor() {
    this.log = LOG.getSubLogger({ name: 'matp' });

    this.a1 = PrivateKey.random().toPublicKey();
    this.a2 = PrivateKey.random().toPublicKey();
    this.a3 = PrivateKey.random().toPublicKey();
    this.a4 = PrivateKey.random().toPublicKey();
    this.a5 = PrivateKey.random().toPublicKey();
    this.a6 = PrivateKey.random().toPublicKey();
    this.a7 = PrivateKey.random().toPublicKey();
    this.a8 = PrivateKey.random().toPublicKey();
  }

  async initialize(account: PrivateKey) {
    this.sender = account;
  }
}

abstract class MultiAccWithZkApp extends MultiAccTrans {
  zk: MultiAcc;
  zkKey: PrivateKey;

  constructor() {
    super();

    this.zkKey = PrivateKey.random();
    this.zk = new MultiAcc(this.zkKey.toPublicKey());

    this.log.info(`zkApp public key: ${this.zkKey.toPublicKey().toBase58()}`);
    this.log.debug(`zkApp private key: ${this.zkKey.toBase58()}`);
  }

  async initialize(account: PrivateKey) {
    super.initialize(account);

    this.log.debug('compiling zkApp...');
    await MultiAcc.compile();
    this.log.debug('done');

    this.log.debug('deploying zkApp...');

    let tx = await Mina.transaction(
      { fee: 1e9, sender: account.toPublicKey() },
      () => {
        let update = AccountUpdate.fundNewAccount(account.toPublicKey());
        update.send({ to: this.zkKey.toPublicKey(), amount: 100e9 });
        this.zk.deploy();
      }
    );

    // this.log.debug('generating a proof...');
    // await tx.prove();

    this.log.debug('signing and sending the transaction...');
    let sentTx = await tx.sign([account, this.zkKey]).send();
    if (!sentTx.isSuccess) {
      this.log.error('error deploying zkApp');
      throw 'error deploying zkapp';
    }
    this.log.info('deploy transaction is sent: hash is', sentTx.hash());

    this.log.debug('waiting for account to be funded...');
    await sentTx.wait();
    this.log.info('zkapp is ready and deployed');
  }
}

class Simple8 extends MultiAccTrans implements LoadDescriptor {
  transactionBody() {
    return () => {
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a1,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a2,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a3,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a4,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a5,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a6,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a7,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a8,
        amount: UInt64.from(10e9),
      });
    };
  }
}

LoadRegistry.register('simple8', Simple8);

class Simple4AndZkApp4 extends MultiAccWithZkApp implements LoadDescriptor {
  transactionBody() {
    return () => {
      this.zk.deposit(UInt64.from(30e9));
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a1,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a2);
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a3,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a4);
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a5,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a6);
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a7,
        amount: UInt64.from(10e9),
      });
    };
  }
}

LoadRegistry.register('simple4-zkapp4', Simple4AndZkApp4);

class ZkApp4AndSimple4 extends MultiAccWithZkApp implements LoadDescriptor {
  transactionBody() {
    return () => {
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a1,
        amount: UInt64.from(10e9),
      });
      this.zk.deposit(UInt64.from(30e9));
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a3,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a2);
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a5,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a4);
      AccountUpdate.createSigned(this.sender.toPublicKey()).send({
        to: this.a7,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a6);
    };
  }
}

LoadRegistry.register('zkapp4-simple4', ZkApp4AndSimple4);

class ZkApp4 extends MultiAccWithZkApp implements LoadDescriptor {
  transactionBody() {
    return () => {
      this.zk.deposit(UInt64.from(30e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
      this.zk.transfer(UInt64.from(10e9), this.a2);
      this.zk.transfer(UInt64.from(10e9), this.a3);
    };
  }
}

LoadRegistry.register('zkapp4', ZkApp4);

class ZkApp8 extends MultiAccWithZkApp implements LoadDescriptor {
  transactionBody() {
    return () => {
      this.zk.deposit(UInt64.from(70e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
      this.zk.transfer(UInt64.from(10e9), this.a2);
      this.zk.transfer(UInt64.from(10e9), this.a3);
      this.zk.transfer(UInt64.from(10e9), this.a4);
      this.zk.transfer(UInt64.from(10e9), this.a5);
      this.zk.transfer(UInt64.from(10e9), this.a6);
      this.zk.transfer(UInt64.from(10e9), this.a7);
    };
  }
}
LoadRegistry.register('zkapp8', ZkApp8);

class ZkApp9 extends MultiAccWithZkApp implements LoadDescriptor {
  transactionBody() {
    return () => {
      this.zk.deposit(UInt64.from(80e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
      this.zk.transfer(UInt64.from(10e9), this.a2);
      this.zk.transfer(UInt64.from(10e9), this.a3);
      this.zk.transfer(UInt64.from(10e9), this.a4);
      this.zk.transfer(UInt64.from(10e9), this.a5);
      this.zk.transfer(UInt64.from(10e9), this.a6);
      this.zk.transfer(UInt64.from(10e9), this.a7);
      this.zk.transfer(UInt64.from(10e9), this.a8);
    };
  }
}
LoadRegistry.register('zkapp9', ZkApp9);
