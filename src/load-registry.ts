import { Command, OptionValues } from '@commander-js/extra-typings';
import { isReady, shutdown } from 'snarkyjs';
import { LoadDescriptor } from './load-descriptor.js';

type Ctor<A extends LoadDescriptor, Opts> = new (opts: Opts) => A;

let registry: [Command<[], any>, Ctor<any, any>][] = [];

type Action = (_: LoadDescriptor) => Promise<void>;

// declare function register<Load extends LoadDescriptor>(name: string, load: Ctor<Load, void>): void;
// declare function register<Load extends LoadDescriptor, Opts extends OptionValues>(name: string, load: Ctor<Load, Opts>, command: Command<[], Opts>): void;
function register<Load extends LoadDescriptor, Opts extends OptionValues>(
  load: Ctor<Load, Opts>,
  command: Command<[], Opts>
): void {
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
  registry.push([command, load]);
}

function load(name: string, opts: any): LoadDescriptor {
  const desc = registry.find((c) => c[0].name() === name);
  if (desc === undefined) {
    throw `unknown load ${name}`;
  }
  return new desc[1](opts);
}

function loads<Load extends LoadDescriptor, Opts extends OptionValues>(): [
  Command<[], Opts>,
  Ctor<Load, Opts>
][] {
  return registry;
}

function registerLoadCommand<Opts extends OptionValues>(
  command: Command<[], Opts>,
  loadAction: (opts: Opts, load: LoadDescriptor) => Promise<void>
): Command<[], Opts> {
  command.hook('preAction', (command, action) => {
    (action.opts() as any).loadAction = async (load: LoadDescriptor) => {
      await loadAction(command.opts(), load);
    };
  });
  for (let [cmd, _] of registry) {
    command.addCommand(cmd);
  }
  return command;
}

export const LoadRegistry = {
  register,
  registerLoadCommand,
  load,
  loads,
};
