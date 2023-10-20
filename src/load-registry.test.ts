import { Command } from '@commander-js/extra-typings';
import { PublicKey } from 'o1js';
import { LoadRegistry } from './load-registry';
import { LoadDescriptor, TransactionData } from './load-descriptor.js';

describe('load registry tests', () => {
  it('should allow registering no-opts load', () => {
    class Load implements LoadDescriptor {
      constructor(_opts: { qq: number }) {}
      getSetupTransaction(
        _account: PublicKey
      ): Promise<TransactionData | undefined> {
        throw new Error('Method not implemented.');
      }
      getTransaction(_account: PublicKey): Promise<TransactionData> {
        throw new Error('Method not implemented.');
      }
    }
    LoadRegistry.register(Load, () => new Command('no-opts'));
  });

  it('should allow registering load with opts', () => {
    class Load implements LoadDescriptor {
      constructor(_opts: { option: string }) {}
      getSetupTransaction(
        _account: PublicKey
      ): Promise<TransactionData | undefined> {
        throw new Error('Method not implemented.');
      }
      getTransaction(_account: PublicKey): Promise<TransactionData> {
        throw new Error('Method not implemented.');
      }
    }
    LoadRegistry.register(Load, () =>
      new Command('with-options').option(
        '-o, --option <foo>',
        'test option',
        'default'
      )
    );
  });
});
