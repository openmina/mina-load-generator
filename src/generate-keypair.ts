import { Command } from '@commander-js/extra-typings';
import { PrivateKey } from 'snarkyjs';

export const generateKeyPair = new Command('generate-keypair')
  .description('generates Mina keypair')
  .action(async (_) => {
    const privateKey = PrivateKey.random();
    const publicKey = privateKey.toPublicKey();
    console.log('Private key: ' + privateKey.toBase58());
    console.log('Public key:  ' + publicKey.toBase58());
  });
