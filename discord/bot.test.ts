import { Client, GatewayIntentBits, Message, MessagePayload, InteractionEditReplyOptions } from 'discord.js';
import { createMockInteraction, MockInteractionOptions } from './test/utils';
import { config } from 'dotenv';
import { handleSellCommand } from './commands/sell';
import { handleBuyCommand } from './commands/buy';
import { connectDB } from '../src/lib/mongodb';
import { defaultSettings } from '../src/config/defaultSettings';
import { EventEmitter } from 'events';
import limiter from '../src/lib/limiter';

config();

// Set a higher timeout for long-running tests
jest.setTimeout(60000); // 60 seconds

describe('Bot Commands', () => {
  let client: Client;
  let mongoConnection: any;
  const eventEmitter = new EventEmitter();

  beforeAll(async () => {
    // Connect to the test database
    mongoConnection = await connectDB();

    // Insert test user and other necessary data here if not already present

    // Initialize Discord client
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  });

  afterAll(async () => {
    // Close MongoDB connection
    if (mongoConnection) {
      await mongoConnection.disconnect();
    }

    // Destroy Discord client
    if (client) {
      await client.destroy();
    }
    
    // Clean up any resources, timers, or listeners
    eventEmitter.removeAllListeners();
  });

  it('should execute sell command and proceed through the entire trading process', async () => {
    const options = {
      mode: 'SELL',
      tokenAddress: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
      settings: defaultSettings,
    };

    const interaction = createMockInteraction(client, options as MockInteractionOptions);
    const editReplyCalls: any[] = [];
    
    // Mock editReply to capture calls
    interaction.editReply = jest.fn(
      async (content: string | MessagePayload | InteractionEditReplyOptions): Promise<Message<boolean>> => {
        editReplyCalls.push(content);
        return {} as Message<boolean>;
      }
    ) as any;

    const processComplete = new Promise<void>((resolve, reject) => {
      const processStates = {
        transfersInitiated: false,
        transfersConfirmed: false,
        swapComplete: false,
        executeSwapsForUsersCompleted: false,
        limiterIdle: false,
        allOperationsComplete: false
      };
      
      const limiterIdleHandler = () => {
        processStates.limiterIdle = true;
        checkComplete();
      };
      
      limiter.on('idle', limiterIdleHandler);
      
      eventEmitter.on('transfersInitiated', () => {
        console.log('Event: transfersInitiated');
        processStates.transfersInitiated = true;
        checkComplete();
      });
      
      eventEmitter.on('transfersConfirmed', () => {
        console.log('Event: transfersConfirmed');
        processStates.transfersConfirmed = true;
        checkComplete();
      });
      
      eventEmitter.on('swapComplete', () => {
        console.log('Event: swapComplete');
        processStates.swapComplete = true;
        checkComplete();
      });

      eventEmitter.on('executeSwapsForUsersCompleted', () => {
        console.log('Event: executeSwapsForUsersCompleted');
        processStates.executeSwapsForUsersCompleted = true;
        processStates.allOperationsComplete = true;
        checkComplete();
      });

      function checkComplete() {
        console.log('Current process states:', JSON.stringify(processStates));
        if (Object.values(processStates).every(state => state)) {
          limiter.removeAllListeners();
          eventEmitter.removeAllListeners();
          resolve();
        }
      }
      
      setTimeout(() => {
        console.log('Timeout reached. Final process states:', JSON.stringify(processStates));
        limiter.removeAllListeners();
        eventEmitter.removeAllListeners();
        reject(new Error(`Process incomplete. Status: ${JSON.stringify(processStates)}`));
      }, 60000); // Increased timeout to 60 seconds
    });

    try {
      await Promise.all([
        handleSellCommand(
          interaction,
          async (collector) => {
            console.log('Test: Emitting button interaction');
            collector.emit('collect', {
              customId: 'percentage_0',
              isRepliable: () => true,
              deferUpdate: jest.fn().mockResolvedValue(undefined),
              update: jest.fn().mockResolvedValue(undefined),
              editReply: jest.fn().mockResolvedValue(undefined),
              followUp: jest.fn().mockResolvedValue(undefined),
              user: { id: interaction.user.id },
              channelId: interaction.channelId,
            });
          },
          'swap_now',
          1000,
          eventEmitter
        ),
        processComplete
      ]);
    } finally {
      // Cleanup is now handled in checkComplete and timeout
    }

    // Wait a bit for any final async operations
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(editReplyCalls).toContainEqual(
      expect.objectContaining({
        content: expect.stringContaining('Select a percentage')
      })
    );
  });

  // it.skip('should execute Buy command and proceed through the entire trading process', async () => {
  //   const options = {
  //     mode: 'BUY',
  //     tokenAddress: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', // POPCAT token
  //     settings: defaultSettings,
  //   };

  //   const interaction = createMockInteraction(client, options as MockInteractionOptions);

  //   // Override interaction.editReply to track calls
  //   const editReplyCalls: any[] = [];
  //   interaction.editReply = jest.fn(
  //     async (
  //       content: string | MessagePayload | InteractionEditReplyOptions
  //     ): Promise<Message<boolean>> => {
  //       editReplyCalls.push(content);
  //       // Return a mock Message object
  //       return {} as Message<boolean>;
  //     }
  //   ) as unknown as (
  //     options: string | MessagePayload | InteractionEditReplyOptions
  //   ) => Promise<Message<boolean>>;

  //   // Create an event emitter
  //   const eventEmitter = new EventEmitter();

  //   const swapsCompleted = new Promise<void>((resolve) => {
  //     eventEmitter.on('executeSwapsForUsersCompleted', () => resolve());
  //   });

  //   // Start the Buy command and wait for it to complete
  //   await handleBuyCommand(
  //     interaction,
  //     async (collector) => {
  //       // Simulate percentage selection button interaction
  //       collector.emit('collect', {
  //         customId: 'percentage_0',
  //         isRepliable: () => true,
  //         deferUpdate: jest.fn().mockResolvedValue(undefined as never),
  //         update: jest.fn().mockResolvedValue(undefined as never),
  //         editReply: jest.fn().mockResolvedValue(undefined as never),
  //         followUp: jest.fn().mockResolvedValue(undefined as never),
  //         user: { id: interaction.user.id },
  //         channelId: interaction.channelId,
  //       });

  //       // Wait for the collector's 'collect' handler to process
  //       await new Promise((resolve) => setImmediate(resolve));
  //     },
  //     'swap_now', // Simulate pressing 'Swap Now' button
  //     1000        // Set swapTime to 1 second for testing
  //   );

  //   // Wait for swaps to complete
  //   await swapsCompleted;

  //   // Wait for all asynchronous operations to complete
  //   await new Promise((resolve) => setTimeout(resolve, 20000)); // Adjust the timeout as needed

  //   // Assertions
  //   expect(interaction.editReply).toHaveBeenCalledWith(
  //     expect.objectContaining({
  //       content: expect.stringContaining('Select a percentage'),
  //     })
  //   );

  //   expect(interaction.editReply).toHaveBeenCalledWith(
  //     expect.objectContaining({
  //       content: 'Processing swaps...',
  //     })
  //   );
  // }, 60000); // Set a higher timeout if necessary
});
