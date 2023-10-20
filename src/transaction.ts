import { Field, Mina, PrivateKey, PublicKey, Types, UInt32 } from 'o1js';

type Transaction = Mina.Transaction;
type Stored = Types.Json.ZkappCommand;
const Nonce = Types.UInt32;

export class TransactionTemplate {
  tx: Stored;
  signers: PrivateKey[];

  static fromMina(tx: Transaction, signers: PrivateKey[]): TransactionTemplate {
    return new TransactionTemplate(save(tx), signers);
  }

  static fromJSON(json: { tx: any; signers: any[] }): TransactionTemplate {
    const { tx, signers } = json;
    return new TransactionTemplate(
      tx,
      signers.map((p: any) => PrivateKey.fromJSON(p))
    );
  }

  private constructor(tx: Stored, signers: PrivateKey[]) {
    this.tx = tx;
    this.signers = signers;
  }

  toJSON(): { tx: any; signers: any[] } {
    return {
      tx: this.tx,
      signers: this.signers.map((p) => p.toJSON()),
    };
  }

  getFeePayer(): PublicKey {
    return PublicKey.fromBase58(this.tx.feePayer.body.publicKey);
  }

  getSigned(nonce?: number | UInt32 | Field): Mina.Transaction {
    const tx = restore(this.tx);
    if (nonce !== undefined)
      tx.transaction.feePayer.body.nonce = Nonce.from(nonce);
    return tx.sign(this.signers);
  }
}

function save(tx: Mina.Transaction): Stored {
  let trans = tx.transaction;
  let json = JSON.parse(tx.toJSON()) as Types.Json.ZkappCommand;
  saveLazyAuth(json.feePayer, trans.feePayer);
  for (let i = 0; i < trans.accountUpdates.length; i++) {
    saveLazyAuth(json.accountUpdates[i], trans.accountUpdates[i]);
  }
  return json;
}

function restore(json: Stored): Mina.Transaction {
  let tx = Mina.Transaction.fromJSON(json);
  let trans = tx.transaction;
  restoreLazyAuth(json.feePayer, trans.feePayer);
  for (let i = 0; i < trans.accountUpdates.length; i++) {
    restoreLazyAuth(json.accountUpdates[i], trans.accountUpdates[i]);
  }
  return tx;
}

function saveLazyAuth<T>(dst: any, src: { lazyAuthorization?: T | undefined }) {
  if (src.lazyAuthorization) {
    dst.lazyAuthorization = Object.assign({}, src.lazyAuthorization);
  }
}

function restoreLazyAuth<T>(
  src: any,
  dst: { lazyAuthorization?: T | undefined }
) {
  if (src.lazyAuthorization) {
    dst.lazyAuthorization = Object.assign({}, src.lazyAuthorization);
  }
}
