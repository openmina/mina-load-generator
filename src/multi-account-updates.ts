import {
  Argument,
  Command,
  Option,
  OptionValues,
} from '@commander-js/extra-typings';
import { AccountUpdate, PrivateKey, PublicKey, UInt64 } from 'o1js';
import { Logger } from 'tslog';
import { LoadDescriptor, TransactionData } from './load-descriptor.js';
import { LoadRegistry } from './load-registry.js';
import { LOG } from './log.js';
import { MultiAcc } from './MultiAcc.js';
import { myParseAccounts, myParseMina } from './parse-int.js';

export interface Transfer {
  to: PublicKey;
  amount: number;
}

interface SimpleOpts extends OptionValues {
  amount: number;
  fee: number;
}

interface ZkappOpts extends SimpleOpts {
  initialAmount: number;
}

function accounts() {
  return new Argument('<public-key...>', 'accounts to transfer funds to')
    .argParser(myParseAccounts)
    .default([]);
}

function amount() {
  return new Option('-a, --amount <mina>', 'amount to transfer')
    .argParser(myParseMina)
    .default(1);
}

function initialAmount() {
  return new Option(
    '-i, --initial-amount <mina>',
    'inital amount to fund zkapp account with'
  )
    .argParser(myParseMina)
    .default(1000);
}

function fee() {
  return new Option('-f, --fee <mina>', 'amount of fee')
    .argParser(myParseMina)
    .default(0.025);
}

function simpleCommand(
  name: string,
  description?: string
): () => Command<[PublicKey[]], SimpleOpts> {
  return () =>
    new Command(name)
      .description(description || '')
      .addArgument(accounts())
      .addOption(amount())
      .addOption(fee());
}

function zkappCommand(
  name: string,
  description?: string
): () => Command<[PublicKey[]], ZkappOpts> {
  return () =>
    new Command(name)
      .description(description || '')
      .addArgument(accounts())
      .addOption(amount())
      .addOption(initialAmount())
      .addOption(fee());
}

abstract class MultiAccTrans implements LoadDescriptor {
  log: Logger<any>;
  sender: PublicKey;
  accounts: PublicKey[];
  amount: number;
  fee: number;

  constructor(accounts: PublicKey[], opts: SimpleOpts) {
    this.log = LOG.getSubLogger({ name: 'matp' });
    this.accounts = accounts;
    this.amount = opts.amount * 1e9;
    this.fee = opts.fee * 1e9;

    this.log.debug('accounts:', this.accounts.map(PublicKey.toBase58));
    this.log.debug('amount', this.amount);
    this.log.debug('fee:', this.fee);
  }

  getSetupTransaction(
    account: PublicKey
  ): Promise<TransactionData | undefined> {
    this.sender = account;
    return Promise.resolve(undefined);
  }

  getTransaction(_account: PublicKey) {
    return Promise.resolve({
      fee: this.fee,
      signers: this.signers(),
      body: this.body(),
    });
  }

  signers(): PrivateKey[] {
    return [];
  }

  abstract body(): () => void;
}

abstract class MultiAccWithZkApp extends MultiAccTrans {
  zk: MultiAcc;
  zkKey: PrivateKey;
  initialAmount: number;

  constructor(accounts: PublicKey[], opts: ZkappOpts) {
    super(accounts, opts);

    this.zkKey = PrivateKey.random();
    this.zk = new MultiAcc(this.zkKey.toPublicKey());
    this.initialAmount = opts.initialAmount * 1e9;

    this.log.info(`zkApp public key: ${this.zkKey.toPublicKey().toBase58()}`);
    this.log.debug(`zkApp private key: ${this.zkKey.toBase58()}`);
  }

  async getSetupTransaction(account: PublicKey) {
    this.log.debug('compiling zkApp...');
    await MultiAcc.compile();
    this.log.debug('done');

    return {
      body: () => {
        let update = AccountUpdate.fundNewAccount(account);
        update.send({
          to: this.zkKey.toPublicKey(),
          amount: this.initialAmount,
        });
        this.zk.deploy();
      },
      fee: this.fee,
      signers: [this.zkKey],
    };
  }
}

class Simple1 extends MultiAccTrans {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[0],
        amount: UInt64.from(this.amount),
      });
    };
  }
}
LoadRegistry.register(Simple1, simpleCommand('simple1'));

class Simple2 extends MultiAccTrans {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[0],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[1],
        amount: UInt64.from(this.amount),
      });
    };
  }
}
LoadRegistry.register(Simple2, simpleCommand('simple2', ''));

class Simple4 extends MultiAccTrans {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[0],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[1],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[2],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[3],
        amount: UInt64.from(this.amount),
      });
    };
  }
}
LoadRegistry.register(Simple4, simpleCommand('sign-x4'));

class Simple8 extends MultiAccTrans {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[0],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[1],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[2],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[3],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[4],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[5],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[6],
        amount: UInt64.from(this.amount),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[7],
        amount: UInt64.from(this.amount),
      });
    };
  }
}
LoadRegistry.register(Simple8, simpleCommand('simple8'));

class Simple4AndZkApp4 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(this.amount * 4));
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[0],
        amount: UInt64.from(this.amount),
      });
      this.zk.transfer(UInt64.from(this.amount), this.accounts[1]);
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[2],
        amount: UInt64.from(this.amount),
      });
      this.zk.transfer(UInt64.from(this.amount), this.accounts[3]);
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[4],
        amount: UInt64.from(this.amount),
      });
      this.zk.transfer(UInt64.from(this.amount), this.accounts[5]);
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[6],
        amount: UInt64.from(this.amount),
      });
      //this.zk.transfer(UInt64.from(this.amount), this.accounts[7]);
    };
  }
}
LoadRegistry.register(Simple4AndZkApp4, zkappCommand('simple4-zkapp4'));

class ZkApp4AndSimple4 extends MultiAccWithZkApp {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[0],
        amount: UInt64.from(10e9),
      });
      this.zk.deposit(UInt64.from(this.amount * 3));
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[1],
        amount: UInt64.from(this.amount),
      });
      this.zk.transfer(UInt64.from(this.amount), this.accounts[2]);
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[3],
        amount: UInt64.from(this.amount),
      });
      this.zk.transfer(UInt64.from(this.amount), this.accounts[4]);
      AccountUpdate.createSigned(this.sender).send({
        to: this.accounts[5],
        amount: UInt64.from(this.amount),
      });
      this.zk.transfer(UInt64.from(this.amount), this.accounts[6]);
    };
  }
}
LoadRegistry.register(ZkApp4AndSimple4, zkappCommand('zkapp4-simple4'));

class ZkApp1 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(this.amount));
    };
  }
}
LoadRegistry.register(ZkApp1, zkappCommand('zkapp1'));

class ZkApp2 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(this.amount));
      this.zk.transfer(UInt64.from(this.amount), this.accounts[0]);
    };
  }
}
LoadRegistry.register(ZkApp2, zkappCommand('zkapp2'));

class ZkApp3 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(this.amount * 2));
      this.zk.transfer(UInt64.from(this.amount), this.accounts[0]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[1]);
    };
  }
}
LoadRegistry.register(ZkApp3, zkappCommand('sign-proof-x3'));

class ZkApp4 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(this.amount * 3));
      this.zk.transfer(UInt64.from(this.amount), this.accounts[0]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[1]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[2]);
    };
  }
}
LoadRegistry.register(ZkApp4, zkappCommand('zkapp4'));

class ZkApp8 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(this.amount * 7));
      this.zk.transfer(UInt64.from(this.amount), this.accounts[0]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[1]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[2]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[3]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[4]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[5]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[6]);
    };
  }
}
LoadRegistry.register(ZkApp8, zkappCommand('zkapp8'));

class ZkApp9 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(this.amount * 8));
      this.zk.transfer(UInt64.from(this.amount), this.accounts[0]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[1]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[2]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[3]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[4]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[5]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[6]);
      this.zk.transfer(UInt64.from(this.amount), this.accounts[7]);
    };
  }
}
LoadRegistry.register(ZkApp9, zkappCommand('zkapp9'));
