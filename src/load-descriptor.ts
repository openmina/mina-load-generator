import { PrivateKey, PublicKey } from 'o1js';

//import { ZkappCommand } from 'o1js/dist/node/lib/account_update.js';
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
