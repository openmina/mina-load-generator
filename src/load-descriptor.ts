import { PrivateKey, PublicKey } from 'snarkyjs';

//import { ZkappCommand } from 'snarkyjs/dist/node/lib/account_update.js';
export type TransactionBody = () => void;
export type TransactionData = {
  body: TransactionBody;
  fee?: number;
  signers?: PrivateKey[];
};

export interface LoadDescriptor {
  getSetupTransaction(account: PublicKey): Promise<TransactionData | undefined>;
  getTransaction(account: PublicKey): Promise<TransactionData>;
}
