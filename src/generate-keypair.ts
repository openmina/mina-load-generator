import { Command } from '@commander-js/extra-typings';
import { PrivateKey } from 'snarkyjs';

export const generateKeyPair = new Command('generate-keypair')
  .option('-k, --private-key <private-key>', 'Private key')
  .description('generates Mina keypair')
  .action(async (opts) => {
    const privateKey = opts.privateKey
      ? PrivateKey.fromBase58(opts.privateKey)
      : PrivateKey.random();
    const publicKey = privateKey.toPublicKey();
    console.log('Private key: ' + privateKey.toBase58());
    console.log('Public key:  ' + publicKey.toBase58());
  });
