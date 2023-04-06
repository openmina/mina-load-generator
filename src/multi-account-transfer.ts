import { Command } from '@commander-js/extra-typings';
import { AccountUpdate, PrivateKey, PublicKey } from 'snarkyjs';
import { LoadDescriptor, LoadRegistry } from './load-registry.js';
import { myParseInt } from './parse-int.js';

export interface Transfer {
  to: PublicKey;
  amount: number;
}

class MultiAccTrans implements LoadDescriptor {
  account: PublicKey;
  recepients: PublicKey[];

  getCommand() {
    return new Command()
      .option(
        '-n, --accounts-number <number>',
        'number of accounts to transfer to',
        myParseInt,
        1
      )
      .option(
        '-a, --amount <mina>',
        'amount, in mina, to send',
        myParseInt,
        10
      );
  }

  initialize(account: PrivateKey) {
    this.account = account.toPublicKey();
    this.recepients = Array(8).map((_) => PrivateKey.random().toPublicKey());
    return Promise.resolve();
  }

  transactionBody(config: any) {
    const sender = this.account;
    const accountsNumber = config.accountsNumber || 1;
    const transfers = this.recepients.map((r) => ({
      to: r,
      amount: config.amount,
    }));
    return () => {
      if (transfers[0] !== undefined && accountsNumber > 0) {
        AccountUpdate.createSigned(sender).send(transfers[0]);
      }
      if (transfers[1] !== undefined && accountsNumber > 1) {
        AccountUpdate.createSigned(sender).send(transfers[1]);
      }
      if (transfers[2] !== undefined && accountsNumber > 2) {
        AccountUpdate.createSigned(sender).send(transfers[2]);
      }
      if (transfers[3] !== undefined && accountsNumber > 3) {
        AccountUpdate.createSigned(sender).send(transfers[3]);
      }
    };
  }
}

LoadRegistry.register('multi-account-transfer', new MultiAccTrans());
