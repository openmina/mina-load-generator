import { Command, OptionValues } from '@commander-js/extra-typings';
import { LoadDescriptor } from './load-descriptor.js';

type Ctor<A extends LoadDescriptor, Args extends any[], Opts> = new (
  ...args: [...Args, Opts]
) => A;

let registry: [() => Command<any, any>, Ctor<any, any, any>][] = [];

type Action = (_: LoadDescriptor) => Promise<void>;

// declare function register<Load extends LoadDescriptor>(name: string, load: Ctor<Load, void>): void;
// declare function register<Load extends LoadDescriptor, Opts extends OptionValues>(name: string, load: Ctor<Load, Opts>, command: Command<[], Opts>): void;
function register<
  Args extends any[],
  Load extends LoadDescriptor,
  Opts extends OptionValues
>(load: Ctor<Load, Args, Opts>, _command: () => Command<Args, Opts>): void {
  const cmd = () => {
    const command = _command();
    command.action(async (...args: [...Args, Opts, any]) => {
      const args1 = args.slice(0, args.length - 2) as [...Args];
      args.pop();
      let opts = args.pop() as Opts;
      const loadAction: Action | undefined = (opts as any).loadAction;
      if (loadAction === undefined || loadAction === null) {
        throw new Error('load action is not defined');
      }
      const l = new load(...args1, opts);
      await loadAction(l);
    });
    return command;
  };
  registry.push([cmd, load]);
}

function registerLoadCommand<Args extends any[], Opts extends OptionValues>(
  command: Command<Args, Opts>,
  loadAction: (opts: Opts, load: LoadDescriptor, name: string) => Promise<void>
): Command<Args, Opts> {
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
