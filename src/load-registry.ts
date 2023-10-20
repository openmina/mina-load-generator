import { Command, OptionValues } from '@commander-js/extra-typings';
import { isReady, shutdown } from 'o1js';
import { LoadDescriptor } from './load-descriptor.js';

type Ctor<A extends LoadDescriptor, Opts> = new (opts: Opts) => A;

let registry: [() => Command<[], any>, Ctor<any, any>][] = [];

type Action = (_: LoadDescriptor) => Promise<void>;

// declare function register<Load extends LoadDescriptor>(name: string, load: Ctor<Load, void>): void;
// declare function register<Load extends LoadDescriptor, Opts extends OptionValues>(name: string, load: Ctor<Load, Opts>, command: Command<[], Opts>): void;
function register<Load extends LoadDescriptor, Opts extends OptionValues>(
  load: Ctor<Load, Opts>,
  _command: () => Command<[], Opts>
): void {
  const cmd = () => {
    const command = _command();
    command.action(async (opts: Opts) => {
      const loadAction: Action | undefined = (opts as any).loadAction;
      if (loadAction === undefined || loadAction === null) {
        throw new Error('load action is not defined');
      }
      await isReady;
      const l = new load(opts);
      await loadAction(l);
      await shutdown();
    });
    return command;
  };
  registry.push([cmd, load]);
}

function registerLoadCommand<Opts extends OptionValues>(
  command: Command<[], Opts>,
  loadAction: (opts: Opts, load: LoadDescriptor, name: string) => Promise<void>
): Command<[], Opts> {
  command.hook('preAction', (command, action) => {
    (action.opts() as any).loadAction = async (load: LoadDescriptor) => {
      await loadAction(command.opts(), load, action.name());
    };
  });
  for (let [cmd, _] of registry) {
    command.addCommand(cmd());
  }
  return command;
}

export const LoadRegistry = {
  register,
  registerLoadCommand,
};
