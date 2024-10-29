import { Client, ButtonInteraction, InteractionCollector,  CommandInteraction, CommandInteractionOptionResolver, CacheType } from 'discord.js';
import { defaultSettings } from '../../src/config/defaultSettings';

export interface MockInteractionOptions {
  mode: 'BUY' | 'SELL';
  tokenAddress: string;
  settings: any;
}

const mockUsers = [{
  discordId: '889620302852661310',
  username: 'crosschainerd',
  email: 'human@bcc.pm',
  wallets: [{
    publicKey: 'DeV4UQkc93FPuJcR8yGj9hV2MYJ9cWrGTXEM2ohyzDEv',
    encryptedSecretData: 'mock_encrypted_data',
    secretType: 'seed',
    connectedChannels: ['1285735381328723968'],
    settings: defaultSettings
  }],
  settings: defaultSettings,  // Add user-level settings
  presets: [],
  referrals: []
},
{
  discordId: '708109610657120266',
  username: 'productengineer',
  email: 'victor.wu.mail+vw@gmail.com',
  wallets: [{
    publicKey: 'CATsRdbAVz9pRd3w2WnEpfvtjybcJuBbfWwnVRSL2cat',
    encryptedSecretData: 'mock_encrypted_data',
    secretType: 'seed',
    connectedChannels: ['1285735381328723968'],
    settings: {
      slippage: 300,
      slippageType: 'dynamic',
      smartMevProtection: null,
      transactionSpeed: 'auto',
      priorityFee: 0,
      entryAmounts: [0.0000111, 0.0000222, 0.0000333, 0.0000444, 0.0000555],
      exitPercentages: [],
      wrapUnwrapSOL: false
    }
  }] as any, // Add type assertion here
  settings: defaultSettings,
  presets: [],
  referrals: []
}];
export const mockDatabase = {
  users: mockUsers,
  findOne: async (query: any) => {
    const user = mockUsers.find(u => u.discordId === query.discordId);
    return user || null;
  }
};

export function createMockInteraction(client: Client, options: MockInteractionOptions): CommandInteraction {
  const mockUser = mockUsers[0];

  // Mock the database functions
  const mockDatabase = {
    findOne: jest.fn().mockResolvedValue(mockUser)
  };

  const UserAccount = {
    findOne: mockDatabase.findOne
  };

  // Create a proper collector with event handling
  class MockCollector {
    callbacks: Map<string, Function>;
    
    constructor() {
      this.callbacks = new Map();
    }

    on(event: string, callback: Function) {
      this.callbacks.set(event, callback);
      return this;
    }

    stop() {
      const endCallback = this.callbacks.get('end');
      if (endCallback) {
        endCallback([], 'stop');
      }
    }

    emit(event: string, ...args: any[]) {
      const callback = this.callbacks.get(event);
      if (callback) {
        callback(...args);
      }
    }
  }

  const mockCollector = new MockCollector();

  const interaction = {
    commandName: 'ct',
    options: {
      get: jest.fn().mockReturnValue({ value: options.tokenAddress }),
      getSubcommand: () => options.mode.toLowerCase(),
      getString: jest.fn().mockReturnValue(options.tokenAddress),
      data: [],
    },
    user: {
      id: mockUser.discordId,
    },
    channel: {
      id: '1285735381328723968',
      type: 'GUILD_TEXT',
      createMessageComponentCollector: () => new MockCollector(),
      createMessageCollector: () => mockCollector,
      send: jest.fn().mockResolvedValue(undefined),
    },
    channelId: '1285735381328723968',
    guildId: '890801755938500678',
    isRepliable: () => true,
    isCommand: () => true,
    client,
    UserAccount,
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  } as unknown as CommandInteraction;

  return interaction;
}

export async function simulateButtonInteraction(
  collector: InteractionCollector<ButtonInteraction>,
  buttonId: string,
  skipConfirmation: boolean = false
) {
  console.log(`Simulating button interaction: ${buttonId}`);
  const mockButtonInteraction = createMockButtonInteraction(buttonId);

  // Simulate button click
  collector.emit('collect', mockButtonInteraction);
  await new Promise(resolve => setTimeout(resolve, 250));
  
  // Simulate swap confirmation only if not explicitly skipped
  if (!skipConfirmation && (buttonId.startsWith('amount_') || buttonId.startsWith('percentage_'))) {
    console.log('Simulating swap confirmation...');
    collector.emit('collect', createMockButtonInteraction('swap_now'));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

function createMockButtonInteraction(customId: string) {
  return {
    customId,
    isRepliable: () => true,
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    user: mockUsers[0].discordId,
    channelId: '1285735381328723968',
    message: {
      interaction: { user: { id: '889620302852661310' } }
    },
    channel: {
      id: '1285735381328723968',
      send: async (content: any) => console.log('Channel send:', content)
    }
  } as unknown as ButtonInteraction;
}

// Add this class at the top of the file
class MockCollector {
  callbacks: Map<string, Function>;
  
  constructor() {
    this.callbacks = new Map();
  }

  on(event: string, callback: Function) {
    this.callbacks.set(event, callback);
    return this;
  }

  emit(event: string, ...args: any[]) {
    const callback = this.callbacks.get(event);
    if (callback) {
      callback(...args);
    }
  }

  stop() {
    const endCallback = this.callbacks.get('end');
    if (endCallback) {
      endCallback([], 'user');
    }
  }
}
