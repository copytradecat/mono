import { jest } from '@jest/globals';
import { Client, GatewayIntentBits, Message, MessagePayload, InteractionEditReplyOptions } from 'discord.js';
import { createMockInteraction, MockInteractionOptions } from './test/utils';
import { config } from 'dotenv';
import { handleSellCommand } from './commands/sell';
import { handleBuyCommand } from './commands/buy';
import { connectDB } from '../src/lib/mongodb';
import { defaultSettings } from '../src/config/defaultSettings';
import * as swapBaseModule from './commands/swap-base';

jest.mock('../commands/swap-base', () => {
  const originalModule = jest.requireActual<typeof swapBaseModule>('../commands/swap-base');
  return {
    __esModule: true,
    ...originalModule,
    executeSwapsForUsers: jest.fn(),
  };
});

config();

const TEST_MODE = process.env.TEST_MODE || 'SELL'; // 'BUY' or 'SELL'
const TEST_TOKEN = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr'; // POPCAT token
const TEST_USER_INDEX = process.env.TEST_USER_INDEX ? parseInt(process.env.TEST_USER_INDEX) : 0;

jest.setTimeout(30000);

describe('Bot Commands', () => {
  let client: Client;
  let mongoConnection: any;

  beforeAll(async () => {
    try {
      // Connect to MongoDB
      mongoConnection = await connectDB();
      
      // Setup Discord client
      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ]
      });

      // Mock client login instead of actually connecting
      jest.spyOn(client, 'login').mockImplementation(async () => 'mock-token');
      
      // Return a promise that resolves immediately
      return Promise.resolve();
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      // Close MongoDB connection
      if (mongoConnection) {
        await mongoConnection.disconnect();
      }

      // Destroy Discord client
      if (client) {
        await client.destroy();
      }

      // Clear any remaining timers
      jest.clearAllTimers();

      // Allow time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  });

  /* istanbul ignore next */
  it('should execute sell command and proceed past swap preview', async () => {
    const options = {
      mode: 'SELL',
      tokenAddress: TEST_TOKEN,
      settings: defaultSettings,
    };

    const interaction = createMockInteraction(client, options as MockInteractionOptions);

    // Array to keep track of editReply calls
    const editReplyCalls: any[] = [];

    // Promise that resolves when editReply is called the second time
    const editReplySecondCall = new Promise<void>((resolve) => {
      interaction.editReply = jest.fn(
        async (
          content: string | MessagePayload | InteractionEditReplyOptions
        ): Promise<Message<boolean>> => {
          editReplyCalls.push(content);
          if (editReplyCalls.length === 2) {
            resolve();
          }
          // Return a mock Message object
          return Promise.resolve({} as Message<boolean>);
        }
      ) as unknown as (options: string | MessagePayload | InteractionEditReplyOptions) => Promise<Message<boolean>>;
    });

    // Create a promise that resolves when executeSwapsForUsers is called
    const executeSwapsPromise = new Promise<void>((resolve) => {
      (swapBaseModule.executeSwapsForUsers as jest.Mock).mockImplementation(async (params) => {
        const realSwapBaseModule = jest.requireActual<typeof swapBaseModule>('./commands/swap-base');
        const result = await realSwapBaseModule.executeSwapsForUsers(params as any);
        resolve();
        return result;
      });
    });

    // Start the command and wait for it to complete
    await handleSellCommand(interaction, async (collector) => {
      // Simulate percentage selection button interaction
      collector.emit('collect', {
        customId: 'percentage_0',
        isRepliable: () => true,
        deferUpdate: jest.fn().mockResolvedValue(undefined as never),
        update: jest.fn().mockResolvedValue(undefined as never),
        editReply: jest.fn().mockResolvedValue(undefined as never),
        followUp: jest.fn().mockResolvedValue(undefined as never),
        user: { id: interaction.user.id },
        channelId: interaction.channelId,
      });

      // Wait for the collector's 'collect' handler to process
      await new Promise((resolve) => setImmediate(resolve));
    });

    // Wait until editReply has been called twice
    await editReplySecondCall;

    // Wait for executeSwapsForUsers to complete
    await executeSwapsPromise;

    // Optionally, add a small delay to ensure all logs complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify editReply calls
    expect(interaction.editReply).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: expect.stringContaining('Select a percentage'),
      })
    );

    expect(interaction.editReply).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: 'Processing swaps...',
      })
    );
  }, 60000);
  /* istanbul ignore next */
  it('should execute buy command and proceed past swap preview', async () => {
    const options = {
      mode: 'BUY',
      tokenAddress: TEST_TOKEN,
      settings: defaultSettings,
    };

    const interaction = createMockInteraction(client, options as MockInteractionOptions);

    // Array to keep track of editReply calls
    const editReplyCalls: any[] = [];

    // Promise that resolves when editReply is called the second time
    const editReplySecondCall = new Promise<void>((resolve) => {
      interaction.editReply = jest.fn(
        async (
          content: string | MessagePayload | InteractionEditReplyOptions
        ): Promise<Message<boolean>> => {
          editReplyCalls.push(content);
          if (editReplyCalls.length === 2) {
            resolve();
          }
          // Return a mock Message object
          return Promise.resolve({} as Message<boolean>);
        }
      ) as unknown as (options: string | MessagePayload | InteractionEditReplyOptions) => Promise<Message<boolean>>;
    });

    // Create a promise that resolves when executeSwapsForUsers is called
    const executeSwapsPromise = new Promise<void>((resolve) => {
      (swapBaseModule.executeSwapsForUsers as jest.Mock).mockImplementation(async (params) => {
        const realSwapBaseModule = jest.requireActual<typeof swapBaseModule>('./commands/swap-base');
        const result = await realSwapBaseModule.executeSwapsForUsers(params as any);
        resolve();
        return result;
      });
    });

    // Start the command and wait for it to complete
    await handleBuyCommand(interaction, async (collector) => {
      // Simulate percentage selection button interaction
      collector.emit('collect', {
        customId: 'amount_0',
        isRepliable: () => true,
        deferUpdate: jest.fn().mockResolvedValue(undefined as never),
        update: jest.fn().mockResolvedValue(undefined as never),
        editReply: jest.fn().mockResolvedValue(undefined as never),
        followUp: jest.fn().mockResolvedValue(undefined as never),
        user: { id: interaction.user.id },
        channelId: interaction.channelId,
      });

      // Wait for the collector's 'collect' handler to process
      await new Promise((resolve) => setImmediate(resolve));
    });

    // Wait until editReply has been called twice
    await editReplySecondCall;

    // Wait for executeSwapsForUsers to complete
    await executeSwapsPromise;

    // Optionally, add a small delay to ensure all logs complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify editReply calls
    expect(interaction.editReply).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: expect.stringContaining('Select a percentage'),
      })
    );

    expect(interaction.editReply).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: 'Processing swaps...',
      })
    );
  }, 60000);
});
