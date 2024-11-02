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
jest.setTimeout(120000); // 2 minutes for all tests

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
    limiter.removeAllListeners();

    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should execute buy command and proceed through the entire trading process', async () => {
    const options = {
      mode: 'BUY',
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
      
      // Clear any existing listeners
      eventEmitter.removeAllListeners();
      limiter.removeAllListeners();
      
      const limiterIdleHandler = () => {
        processStates.limiterIdle = true;
        checkComplete();
      };
      
      limiter.on('idle', limiterIdleHandler);
      
      function checkComplete() {
        console.log('=== Checking Process States ===');
        console.log('Current states:', JSON.stringify(processStates));
        
        const allComplete = Object.values(processStates).every(state => state === true);
        console.log('=== Process Complete ===');
        if (allComplete) {
          clearTimeout(timeoutId); // Clear the timeout if process completes
          resolve();
        }
      }
      
      eventEmitter.on('transfersInitiated', async () => {
        try {
          console.log('Event: transfersInitiated');
          processStates.transfersInitiated = true;
          checkComplete();
        } catch (error) {
          console.error('Error in transfersInitiated handler:', error);
        }
      });
      
      eventEmitter.on('transfersConfirmed', async () => {
        try {
          console.log('Event: transfersConfirmed');
          processStates.transfersConfirmed = true;
          checkComplete();
        } catch (error) {
          console.error('Error in transfersConfirmed handler:', error);
        }
      });
      
      eventEmitter.on('swapComplete', async () => {
        try {
          console.log('Event: swapComplete');
          processStates.swapComplete = true;
          checkComplete();
        } catch (error) {
          console.error('Error in swapComplete handler:', error);
        }
      });

      eventEmitter.on('executeSwapsForUsersCompleted', async () => {
        try {
          console.log('Event: executeSwapsForUsersCompleted');
          processStates.executeSwapsForUsersCompleted = true;
          processStates.allOperationsComplete = true;
          checkComplete();
        } catch (error) {
          console.error('Error in executeSwapsForUsersCompleted handler:', error);
        }
      });

      // Shorter timeout for faster failure
      const timeoutId = setTimeout(() => {
        console.log('=== Test Timeout Reached ===');
        console.log('Final process states:', JSON.stringify(processStates));
        console.log('Limiter status:', {
          received: limiter.counts().RECEIVED,
          queued: limiter.counts().QUEUED,
          running: limiter.counts().RUNNING,
          executing: limiter.counts().EXECUTING
        });
        const finalStates = JSON.stringify(processStates);
        clearTimeout(timeoutId);
        reject(new Error(`Process incomplete after timeout. Final states: ${finalStates}`));
      }, 60000);
    });

    try {
      await Promise.all([
        await handleBuyCommand(
          interaction,
          async (collector) => {
            console.log('Test: Emitting button interaction');
            collector.emit('collect', {
              customId: 'amount_0',
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
        await processComplete
      ]);
    } finally {
      // Cleanup is now handled in checkComplete and timeout
    }

    // Wait a bit for any final async operations
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(editReplyCalls).toContainEqual(
      expect.objectContaining({
        content: expect.stringContaining('Select the amount')
      })
    );
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
      function checkComplete() {
        console.log('=== Checking Process States ===');
        console.log('Current states:', JSON.stringify(processStates));
        const allComplete = Object.values(processStates).every(state => state === true);
        if (allComplete) {
          console.log('=== Process Complete ===');
          clearTimeout(timeoutId); // Clear the timeout if process completes
          resolve();
        }
      }
      
      eventEmitter.on('transfersInitiated', async () => {
        try { 
          console.log('Event: transfersInitiated');
          processStates.transfersInitiated = true;
          checkComplete();
        } catch (error) {
          console.error('Error in transfersInitiated handler:', error);
        }
      });
      
      eventEmitter.on('transfersConfirmed', async () => {
        try {
          console.log('Event: transfersConfirmed');
          processStates.transfersConfirmed = true;
          checkComplete();
        } catch (error) {
          console.error('Error in transfersConfirmed handler:', error);
        }
      });
      
      eventEmitter.on('swapComplete', async () => {
        try {
          console.log('Event: swapComplete');
          processStates.swapComplete = true;
          checkComplete();
        } catch (error) {
          console.error('Error in swapComplete handler:', error);
        }
      });

      eventEmitter.on('executeSwapsForUsersCompleted', async () => {
        try {
          console.log('Event: executeSwapsForUsersCompleted');
          processStates.executeSwapsForUsersCompleted = true;
          processStates.allOperationsComplete = true;
          checkComplete();
        } catch (error) {
          console.error('Error in executeSwapsForUsersCompleted handler:', error);
        }
      });
      
      const timeoutId = setTimeout(() => {
        console.log('=== Test Timeout Reached ===');
        console.log('Final process states:', JSON.stringify(processStates));
        console.log('Limiter status:', {
          received: limiter.counts().RECEIVED,
          queued: limiter.counts().QUEUED,
          running: limiter.counts().RUNNING,
          executing: limiter.counts().EXECUTING
        });
        const finalStates = JSON.stringify(processStates);
        clearTimeout(timeoutId);
        reject(new Error(`Process incomplete after timeout. Final states: ${finalStates}`));
      }, 60000);
    });

    try {
      await Promise.all([
        await handleSellCommand(
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
        await processComplete
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
});

