import { PrivateKey, PublicKey } from 'o1js';
import { Logger } from 'tslog';
import { LOG } from './log.js';

export class Account {
  log: Logger<any>;
  key: PrivateKey;
  account: PublicKey;

  constructor(key?: string) {
    this.key =
      key === undefined ? PrivateKey.random() : PrivateKey.fromBase58(key);
    this.account = this.key.toPublicKey();
    this.log = LOG.getSubLogger({ name: this.key.toBase58() });
    this.log.debug('account ', this.account.toBase58());
  }
}
