import { jest } from '@jest/globals';
import type * as SwapBaseModule from '../commands/swap-base';

global.jest = jest;

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  // Fail the test suite
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Fail the test suite
  process.exit(1);
});

// Mock swap-base module
jest.mock('../commands/swap-base', () => {
  const actual = jest.requireActual<typeof SwapBaseModule>('../commands/swap-base');
  return {
    __esModule: true,
    ...actual,
    promptUserConfirmation: jest.fn().mockImplementation(
      async (): Promise<'swap_now' | 'cancel_swap' | 'timeout'> => 'swap_now'
    )
  };
});