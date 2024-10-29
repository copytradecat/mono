import { jest } from '@jest/globals';
import type * as SwapBaseModule from '../commands/swap-base';

global.jest = jest;

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