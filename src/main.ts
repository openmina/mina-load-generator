import { Command } from '@commander-js/extra-typings';
import { command as serverCommand } from './controller-server.js';
import { jobCommand, localCommand } from './load-generator.js';

await new Command()
  .addCommand(serverCommand)
  .addCommand(jobCommand)
  .addCommand(localCommand)
  .parseAsync(process.argv);
