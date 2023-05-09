import { Command } from '@commander-js/extra-typings';
import { LOG } from './log.js';
// import './multi-account-updates.js';
import './simple-state-update.js';
// import './token.js';
// import { command as serverCommand } from './controller-server.js';
import {
  generateCommand,
  runCommand,
  sendCommand,
  waitCommand,
} from './local.js';
import { serverCommand } from './server.js';

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
  .addCommand(runCommand)
  .addCommand(generateCommand)
  .addCommand(sendCommand)
  .addCommand(waitCommand)
  .addCommand(serverCommand)
  .parseAsync(process.argv);
