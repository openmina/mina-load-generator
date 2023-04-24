import { Mina, Types } from 'snarkyjs';

type Stored = Types.Json.ZkappCommand;
const Nonce = Types.UInt32;

export class Transaction {
  json: Stored;

  constructor(tx: Mina.Transaction) {
    this.json = save(tx);
  }

  create(nonce: number): Mina.Transaction {
    const tx = restore(this.json);
    tx.transaction.feePayer.body.nonce = Nonce.from(nonce);
    return tx;
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
