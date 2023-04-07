import { Command } from '@commander-js/extra-typings';
import { command as serverCommand } from './controller-server.js';
import { jobCommand, localCommand } from './load-generator.js';
import { LOG } from './log.js';

await new Command()
  .option(
    '-v, --verbose',
    'increase logging verbosity ([info] and higher by default)',
    (_, value) => (value === 0 ? value : value - 1),
    3
  )
  .hook('preAction', (cmd) => {
    LOG.settings.minLevel = cmd.opts().verbose as number;
  })
  .addCommand(serverCommand)
  .addCommand(jobCommand)
  .addCommand(localCommand)
  .parseAsync(process.argv);
